# PathHome

Remittance routing for Southeast Asian migrant workers, built on Stellar.

## The problem

Traditional cross-border remittance still charges 5-7% in fees and can take
2-5 days to settle, moving through multiple intermediaries with little rate
transparency. Migrant workers from Indonesia, the Philippines, and Vietnam
sending money home are hit hardest by this, especially when they're
underbanked and have limited alternatives.

## What PathHome does

PathHome uses Stellar's path payments to find the cheapest way to convert a
sender's currency into what the recipient needs, settling in seconds instead
of days. A rule-based routing layer ranks the available paths and explains
in plain language why a given route was recommended, rather than hiding the
decision behind a black box.

## Stellar integration

- **Path payments (strict send)** — queries Horizon's `/paths/strict-send`
  endpoint to discover every route the DEX can currently fill for a given
  asset pair and amount.
- **Wallet connect + real testnet settlement** — connects to Freighter,
  builds an unsigned path payment transaction on the backend (which never
  touches a private key), has the wallet sign it client-side, and submits
  the signed envelope to Horizon. Every settled transfer returns a
  Stellar Expert link so it can be independently verified on-chain.
- **SEP-24** (planned) — interactive fiat deposit/withdraw through local
  anchors for on/off-ramping.
- **SEP-31** (planned) — direct anchor-to-anchor settlement for the
  remittance corridor.
- **Soroban** (planned) — a smart contract to handle conditional splits,
  e.g. sending part of a transfer to immediate cash-out and part to savings.

This MVP implements strict-send path discovery and live, wallet-signed
settlement end to end against Stellar's public testnet. SEP-24/31 and the
Soroban contract are the next build milestones.

## Architecture

```
pathhome/
├── backend/         FastAPI service, talks to Stellar Horizon (testnet)
│   └── app/
│       ├── main.py            API routes
│       ├── stellar_service.py Horizon path-finding wrapper
│       ├── tx_builder.py      Builds unsigned transactions, submits signed ones
│       ├── routing.py         Route ranking + plain-language explanation
│       └── models.py          Request/response schemas
├── frontend/         Next.js UI: route quotes, Freighter wallet connect, live send
└── docker-compose.yml
```

## Sending a real testnet payment

1. Install the [Freighter](https://www.freighter.app/) browser extension and switch it to **Testnet**.
2. Fund your Freighter account using [Friendbot](https://friendbot.stellar.org) if it's new.
3. On the PathHome demo, click **Connect wallet**, run a quote, paste a recipient's testnet public key, then **Send real payment on testnet**.
4. Approve the transaction in the Freighter popup. Once submitted, PathHome shows a Stellar Expert link to the settled transaction.

## Running locally

```bash
docker compose up --build
```

- Backend: http://localhost:8000 (docs at `/docs`)
- Frontend: http://localhost:3000

## Running without Docker

Backend:
```bash
cd backend
py -m venv venv
venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Frontend:
```bash
cd frontend
npm install
npm run dev
```

## Status

Hackathon MVP — demonstrates live route discovery and wallet-signed
settlement against Stellar testnet, end to end. Anchor integration
(SEP-24/31), the Soroban conditional-split contract, and lite-KYC
onboarding are in progress.

## License

MIT
