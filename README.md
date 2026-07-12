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
- **SEP-24** (planned) — interactive fiat deposit/withdraw through local
  anchors for on/off-ramping.
- **SEP-31** (planned) — direct anchor-to-anchor settlement for the
  remittance corridor.
- **Soroban** (planned) — a smart contract to handle conditional splits,
  e.g. sending part of a transfer to immediate cash-out and part to savings.

This MVP currently implements strict-send path discovery end to end against
Stellar's public testnet. SEP-24/31 and the Soroban contract are the next
build milestones.

## Architecture

```
pathhome/
├── backend/         FastAPI service, talks to Stellar Horizon (testnet)
│   └── app/
│       ├── main.py            API routes
│       ├── stellar_service.py Horizon path-finding wrapper
│       ├── routing.py         Route ranking + plain-language explanation
│       └── models.py          Request/response schemas
├── frontend/         Next.js UI for requesting and viewing routes
└── docker-compose.yml
```

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
python -m venv venv && source venv/bin/activate
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

Hackathon MVP — currently demonstrates live route discovery against Stellar
testnet. Anchor integration (SEP-24/31), the Soroban conditional-split
contract, and lite-KYC onboarding are in progress.

## License

MIT
