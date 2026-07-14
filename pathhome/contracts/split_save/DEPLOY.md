# Deploying PathHome Split & Save to Stellar Testnet

This contract's logic is already verified: `cargo test` passes 4/4 unit tests
covering immediate withdrawal, locked-funds enforcement, unlock-after-time,
and state reads (see `src/test.rs`). What's left is compiling it to WASM and
deploying it — both require network access to Stellar's testnet, which isn't
available in the environment that wrote this contract, so you'll run these
steps yourself. It's three commands.

## 1. Install prerequisites (skip any you already have)

```powershell
# Rust, if you don't have it: https://rustup.rs
# Then add the WASM compilation target:
rustup target add wasm32-unknown-unknown

# Stellar CLI (includes the Soroban contract tooling):
cargo install --locked stellar-cli
```

## 2. Configure testnet + an identity to deploy with

```powershell
stellar network add testnet `
  --rpc-url https://soroban-testnet.stellar.org `
  --network-passphrase "Test SDF Network ; September 2015"

# Reuse your Freighter sender account, or generate a fresh deploy identity:
stellar keys generate deployer --network testnet --fund
```

(`--fund` automatically hits Friendbot for you.)

## 3. Build and deploy

From `pathhome/contracts/split_save/`:

```powershell
stellar contract build

stellar contract deploy `
  --wasm target/wasm32-unknown-unknown/release/pathhome_split_save.wasm `
  --source deployer `
  --network testnet
```

This prints a **contract ID** (starts with `C...`). Save it — you'll need it
for every call below and for wiring it into the backend later.

## 4. Try it for real (this is your on-chain proof)

You need a token to deposit. The simplest option for a demo is native XLM's
Stellar Asset Contract wrapper, which already exists on testnet:

```powershell
stellar contract id asset --asset native --network testnet
```

This prints XLM's contract address — use it as `<TOKEN_ADDRESS>` below.

**Deposit** (sender splits 8 XLM immediate / 2 XLM locked for ~30 days):

```powershell
stellar contract invoke `
  --id <CONTRACT_ID> `
  --source deployer `
  --network testnet `
  -- deposit `
  --sender deployer `
  --recipient <RECIPIENT_PUBLIC_KEY> `
  --token <TOKEN_ADDRESS> `
  --immediate_amount 80000000 `
  --locked_amount 20000000 `
  --unlock_time_unix <UNIX_TIMESTAMP_30_DAYS_FROM_NOW>
```

(Amounts are in stroops — 1 XLM = 10,000,000 stroops, so 8 XLM = 80000000.)

This returns a **vault id** (a number, e.g. `0`).

**Withdraw** (recipient claims what's currently unlocked):

```powershell
stellar contract invoke `
  --id <CONTRACT_ID> `
  --source <RECIPIENT_KEY_ALIAS> `
  --network testnet `
  -- withdraw `
  --id 0
```

Each of these calls produces a transaction hash — put the deposit and
withdraw hashes in your README and pitch as verifiable proof the contract
is live, not just written.

## What to do with the contract ID

For the hackathon submission, the safest and most credible move is:

1. Deploy it (above), run one deposit + one withdraw for real
2. Put the contract ID and both transaction hashes in your `README.md` and
   mention it in the video, with a Stellar Expert link to the contract:
   `https://stellar.expert/explorer/testnet/contract/<CONTRACT_ID>`
3. Describe it honestly as **deployed and functionally verified on testnet,
   UI integration in progress** — this is true, credible, and safer than
   rushing a full frontend wiring in the time you have left before the
   deadline.

If you do have time left after that, the next step would be a
`/vault/deposit` and `/vault/withdraw` pair of FastAPI endpoints mirroring
`tx_builder.py`'s pattern (build unsigned invoke transaction → wallet signs
→ backend relays) — but don't attempt that unless the steps above are done
and verified first.
