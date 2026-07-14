#![cfg(test)]

use crate::{PathHomeSplitSave, PathHomeSplitSaveClient};
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token, Address, Env,
};

fn setup<'a>(env: &Env) -> (Address, Address, Address, token::Client<'a>, token::StellarAssetClient<'a>) {
    let sender = Address::generate(env);
    let recipient = Address::generate(env);
    let token_admin = Address::generate(env);

    let token_contract_id = env.register_stellar_asset_contract_v2(token_admin.clone());
    let token_client = token::Client::new(env, &token_contract_id.address());
    let token_admin_client = token::StellarAssetClient::new(env, &token_contract_id.address());

    // Mint the sender enough token balance to deposit with.
    token_admin_client.mint(&sender, &1_000_000);

    (sender, recipient, token_contract_id.address(), token_client, token_admin_client)
}

#[test]
fn immediate_withdrawal_available_right_away() {
    let env = Env::default();
    env.mock_all_auths();

    let (sender, recipient, token_address, token_client, _admin) = setup(&env);

    let contract_id = env.register_contract(None, PathHomeSplitSave);
    let client = PathHomeSplitSaveClient::new(&env, &contract_id);

    let id = client.deposit(&sender, &recipient, &token_address, &800, &200, &(env.ledger().timestamp() + 2_592_000));

    // Sender's balance dropped by the full deposit amount.
    assert_eq!(token_client.balance(&sender), 1_000_000 - 1_000);

    // Recipient can withdraw the immediate portion right away.
    let withdrawn = client.withdraw(&id);
    assert_eq!(withdrawn, 800);
    assert_eq!(token_client.balance(&recipient), 800);
}

#[test]
#[should_panic(expected = "nothing available to withdraw yet")]
fn locked_portion_cannot_be_withdrawn_early() {
    let env = Env::default();
    env.mock_all_auths();

    let (sender, recipient, token_address, _token_client, _admin) = setup(&env);

    let contract_id = env.register_contract(None, PathHomeSplitSave);
    let client = PathHomeSplitSaveClient::new(&env, &contract_id);

    let id = client.deposit(&sender, &recipient, &token_address, &800, &200, &(env.ledger().timestamp() + 2_592_000));

    // Drain the immediate portion first.
    client.withdraw(&id);
    // Second call, still before unlock time: nothing left to withdraw yet.
    client.withdraw(&id);
}

#[test]
fn locked_portion_unlocks_after_time_passes() {
    let env = Env::default();
    env.mock_all_auths();

    let (sender, recipient, token_address, token_client, _admin) = setup(&env);

    let contract_id = env.register_contract(None, PathHomeSplitSave);
    let client = PathHomeSplitSaveClient::new(&env, &contract_id);

    let unlock_at = env.ledger().timestamp() + 2_592_000; // 30 days
    let id = client.deposit(&sender, &recipient, &token_address, &800, &200, &unlock_at);

    client.withdraw(&id); // takes the immediate 800

    // Fast-forward the ledger past the unlock time.
    env.ledger().with_mut(|li| li.timestamp = unlock_at + 1);

    let withdrawn = client.withdraw(&id);
    assert_eq!(withdrawn, 200);
    assert_eq!(token_client.balance(&recipient), 1_000);
}

#[test]
fn vault_state_is_readable() {
    let env = Env::default();
    env.mock_all_auths();

    let (sender, recipient, token_address, _token_client, _admin) = setup(&env);

    let contract_id = env.register_contract(None, PathHomeSplitSave);
    let client = PathHomeSplitSaveClient::new(&env, &contract_id);

    let unlock_at = env.ledger().timestamp() + 2_592_000;
    let id = client.deposit(&sender, &recipient, &token_address, &800, &200, &unlock_at);

    let vault = client.get_vault(&id);
    assert_eq!(vault.immediate_amount, 800);
    assert_eq!(vault.locked_amount, 200);
    assert_eq!(vault.withdrawn_amount, 0);
    assert_eq!(vault.sender, sender);
    assert_eq!(vault.recipient, recipient);
}
