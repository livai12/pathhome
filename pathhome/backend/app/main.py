from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .models import (
    PrepareTransactionRequest,
    PrepareTransactionResponse,
    RouteRequest,
    RouteResponse,
    SubmitTransactionRequest,
    SubmitTransactionResponse,
)
from .routing import rank_routes, explain_recommendation, savings_vs_traditional, TRADITIONAL_REMITTANCE_FEE_PERCENT
from .stellar_service import StellarPathService
from .tx_builder import StellarTransactionService

app = FastAPI(
    title="PathHome API",
    description="Remittance routing API built on Stellar path payments.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten this before any production deployment
    allow_methods=["*"],
    allow_headers=["*"],
)

stellar_service = StellarPathService()
tx_service = StellarTransactionService()


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/route", response_model=RouteResponse)
def get_route(payload: RouteRequest):
    try:
        raw_paths = stellar_service.find_strict_send_paths(
            source_code=payload.source_asset_code,
            source_issuer=payload.source_asset_issuer,
            dest_code=payload.dest_asset_code,
            dest_issuer=payload.dest_asset_issuer,
            send_amount=payload.send_amount,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    if not raw_paths:
        raise HTTPException(
            status_code=404,
            detail=(
                "No route currently available on the Stellar testnet DEX for this pair/amount. "
                "Try a smaller amount or a different asset pair."
            ),
        )

    ranked = rank_routes(raw_paths, send_amount=payload.send_amount)
    best = ranked[0]
    alternatives = ranked[1:4]  # cap alternatives shown in the UI

    explanation = explain_recommendation(best, alternatives)
    savings = savings_vs_traditional(best.estimated_fee_percent)

    return RouteResponse(
        recommended=best,
        alternatives=alternatives,
        explanation=explanation,
        baseline_traditional_fee_percent=TRADITIONAL_REMITTANCE_FEE_PERCENT,
        estimated_savings_percent=savings,
    )


@app.post("/prepare-transaction", response_model=PrepareTransactionResponse)
def prepare_transaction(payload: PrepareTransactionRequest):
    """
    Builds an unsigned path payment transaction for the sender's wallet to
    sign. The backend never sees or requests a private key here.
    """
    try:
        xdr = tx_service.build_path_payment_xdr(
            sender_public_key=payload.sender_public_key,
            recipient_public_key=payload.recipient_public_key,
            source_code=payload.source_asset_code,
            source_issuer=payload.source_asset_issuer,
            dest_code=payload.dest_asset_code,
            dest_issuer=payload.dest_asset_issuer,
            send_amount=payload.send_amount,
            dest_min=payload.dest_min,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    return PrepareTransactionResponse(xdr=xdr, network_passphrase=tx_service.network_passphrase)


@app.post("/submit-transaction", response_model=SubmitTransactionResponse)
def submit_transaction(payload: SubmitTransactionRequest):
    """
    Relays a wallet-signed transaction envelope to Horizon testnet and
    returns the resulting transaction hash plus a Stellar Expert link so
    the settlement can be independently verified.
    """
    try:
        result = tx_service.submit_signed_xdr(payload.signed_xdr)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    tx_hash = result.get("hash", "")
    return SubmitTransactionResponse(
        hash=tx_hash,
        successful=result.get("successful", False),
        explorer_url=f"https://stellar.expert/explorer/testnet/tx/{tx_hash}",
    )
