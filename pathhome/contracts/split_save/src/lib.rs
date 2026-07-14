//! PathHome Split & Save
//!
//! When a remittance settles, most recipients spend it immediately because
//! there is no friction stopping them. This contract adds that friction on
//! purpose: a sender deposits a token amount, specifying what fraction is
//! immediately withdrawable by the recipient and what fraction is locked
//! until a chosen unlock time (e.g. "release the rest in 30 days").
//!
//! This is a genuinely on-chain commitment: once deposited, neither the
//! sender nor PathHome can unlock the funds early or redirect them. Only
//! the recipient can withdraw, and only according to the schedule set at
//! deposit time.

#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, token, Address, Env};

#[derive(Clone)]
#[contracttype]
pub struct Vault {
    pub sender: Address,
    pub recipient: Address,
    pub token: Address,
    /// Amount the recipient can withdraw immediately, in the token's base units.
    pub immediate_amount: i128,
    /// Amount that unlocks only after `unlock_time_unix`.
    pub locked_amount: i128,
    /// Unix timestamp after which `locked_amount` becomes withdrawable.
    pub unlock_time_unix: u64,
    /// Tracks how much of `immediate_amount` + (unlocked) `locked_amount`
    /// has already been withdrawn, so partial withdrawals are possible.
    pub withdrawn_amount: i128,
}

#[contracttype]
pub enum DataKey {
    Vault(u64),
    NextId,
}

#[contract]
pub struct PathHomeSplitSave;

#[contractimpl]
impl PathHomeSplitSave {
    /// Sender deposits `total_amount` of `token`, split into an
    /// immediately-withdrawable portion and a time-locked portion.
    /// Returns the new vault's id, which the recipient uses to withdraw.
    ///
    /// The sender must authorize this call (`sender.require_auth()`), and
    /// the token transfer moves funds from the sender into this contract's
    /// balance immediately.
    pub fn deposit(
        env: Env,
        sender: Address,
        recipient: Address,
        token: Address,
        immediate_amount: i128,
        locked_amount: i128,
        unlock_time_unix: u64,
    ) -> u64 {
        sender.require_auth();

        if immediate_amount < 0 || locked_amount < 0 {
            panic!("amounts must be non-negative");
        }
        let total_amount = immediate_amount
            .checked_add(locked_amount)
            .expect("amount overflow");
        if total_amount <= 0 {
            panic!("total deposit must be greater than zero");
        }

        // Pull the funds from the sender into this contract's custody.
        let token_client = token::Client::new(&env, &token);
        token_client.transfer(&sender, &env.current_contract_address(), &total_amount);

        let id = Self::next_id(&env);
        let vault = Vault {
            sender,
            recipient,
            token,
            immediate_amount,
            locked_amount,
            unlock_time_unix,
            withdrawn_amount: 0,
        };
        env.storage().persistent().set(&DataKey::Vault(id), &vault);
        id
    }

    /// Recipient withdraws whatever is currently unlocked and not yet
    /// withdrawn. Can be called multiple times: once right away for the
    /// immediate portion, and again after `unlock_time_unix` for the rest.
    /// Returns the amount actually transferred out in this call.
    pub fn withdraw(env: Env, id: u64) -> i128 {
        let mut vault: Vault = env
            .storage()
            .persistent()
            .get(&DataKey::Vault(id))
            .expect("vault not found");

        vault.recipient.require_auth();

        let now = env.ledger().timestamp();
        let unlocked_total = if now >= vault.unlock_time_unix {
            vault.immediate_amount + vault.locked_amount
        } else {
            vault.immediate_amount
        };

        let available = unlocked_total - vault.withdrawn_amount;
        if available <= 0 {
            panic!("nothing available to withdraw yet");
        }

        vault.withdrawn_amount += available;
        env.storage().persistent().set(&DataKey::Vault(id), &vault);

        let token_client = token::Client::new(&env, &vault.token);
        token_client.transfer(&env.current_contract_address(), &vault.recipient, &available);

        available
    }

    /// Read-only helper so a frontend can display vault status without
    /// spending a transaction.
    pub fn get_vault(env: Env, id: u64) -> Vault {
        env.storage()
            .persistent()
            .get(&DataKey::Vault(id))
            .expect("vault not found")
    }

    fn next_id(env: &Env) -> u64 {
        let id: u64 = env.storage().persistent().get(&DataKey::NextId).unwrap_or(0);
        env.storage().persistent().set(&DataKey::NextId, &(id + 1));
        id
    }
}

mod test;
