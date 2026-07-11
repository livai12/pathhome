from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .models import RouteRequest, RouteResponse
from .routing import rank_routes, explain_recommendation, savings_vs_traditional, TRADITIONAL_REMITTANCE_FEE_PERCENT
from .stellar_service import StellarPathService

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
