"""
Route ranking logic for PathHome.

This is intentionally rule-based and transparent rather than an opaque model:
for a remittance product, users and judges alike need to be able to see WHY
a route was picked. The "AI copilot" framing refers to this layer being able
to explain trade-offs in plain language, not to a black-box scoring model.
"""

from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP

from .models import RouteOption

# What a traditional remittance operator (e.g. bank wire, MTO) typically charges
# on a Southeast Asia corridor. Used only as a comparison baseline in the UI.
TRADITIONAL_REMITTANCE_FEE_PERCENT = 6.0

# Stellar ledgers close in roughly 5 seconds regardless of route.
STELLAR_SETTLEMENT_SECONDS = 5


def _implied_fee_percent(send_amount: Decimal, dest_amount: Decimal, fx_reference_rate: Decimal | None) -> float:
    """
    Rough fee/slippage estimate for a route: compares the amount actually
    received against what a 1:1 reference rate would imply. If no reference
    rate is supplied, this returns 0.0 and the caller should rely on
    dest_amount comparisons between routes instead of an absolute percentage.
    """
    if fx_reference_rate is None or fx_reference_rate == 0:
        return 0.0
    expected = send_amount * fx_reference_rate
    if expected == 0:
        return 0.0
    diff = (expected - dest_amount) / expected * Decimal(100)
    return float(diff.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def rank_routes(
    raw_paths: list[dict],
    send_amount: str,
    fx_reference_rate: Decimal | None = None,
) -> list[RouteOption]:
    """
    Convert Horizon strict-send-paths records into ranked RouteOption objects,
    sorted by destination amount received (highest first).
    """
    send_dec = Decimal(send_amount)
    options: list[RouteOption] = []

    for record in raw_paths:
        dest_amount = Decimal(record["destination_amount"])
        path_codes = [hop.get("asset_code", "XLM") for hop in record.get("path", [])]
        full_path = [record["source_asset_type"]] + path_codes + [record["destination_asset_type"]]
        hop_count = len(record.get("path", []))

        label = "Direct route" if hop_count == 0 else f"Routed via {hop_count} intermediate asset(s)"

        options.append(
            RouteOption(
                path=full_path,
                source_amount=str(send_dec),
                dest_amount=str(dest_amount),
                estimated_fee_percent=_implied_fee_percent(send_dec, dest_amount, fx_reference_rate),
                settlement_seconds=STELLAR_SETTLEMENT_SECONDS,
                label=label,
            )
        )

    options.sort(key=lambda o: Decimal(o.dest_amount), reverse=True)
    return options


def explain_recommendation(best: RouteOption, alternatives: list[RouteOption]) -> str:
    if not alternatives:
        return (
            f"This is currently the only route Stellar's DEX can fill for this pair. "
            f"It settles in about {best.settlement_seconds} seconds."
        )

    runner_up = alternatives[0]
    diff = Decimal(best.dest_amount) - Decimal(runner_up.dest_amount)
    if diff <= 0:
        return (
            f"Multiple routes return a similar amount. We picked the {best.label.lower()} "
            f"for simplicity — it settles in about {best.settlement_seconds} seconds."
        )
    return (
        f"{best.label} delivers {diff:.2f} more to the recipient than the next best option, "
        f"while still settling in about {best.settlement_seconds} seconds."
    )


def savings_vs_traditional(fee_percent_estimate: float) -> float:
    savings = TRADITIONAL_REMITTANCE_FEE_PERCENT - max(fee_percent_estimate, 0.0)
    return round(max(savings, 0.0), 2)
