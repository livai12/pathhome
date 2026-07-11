"""
Thin wrapper around Stellar Horizon's path-finding endpoints.

PathHome uses Stellar's built-in path payments (strict send) to discover the
cheapest way to convert a sender's asset into the asset a receiver expects,
routing through the Stellar DEX / liquidity pools when a direct trustline
doesn't exist between the two currencies.

Docs: https://developers.stellar.org/docs/data/apis/horizon/api-reference/paths
"""

from __future__ import annotations

from stellar_sdk import Asset, Server
from stellar_sdk.exceptions import BaseRequestError, NotFoundError

HORIZON_TESTNET_URL = "https://horizon-testnet.stellar.org"


def _build_asset(code: str, issuer: str | None) -> Asset:
    if code.upper() == "XLM" and not issuer:
        return Asset.native()
    if not issuer:
        raise ValueError(f"Asset {code} requires an issuer account (native XLM is the only exception)")
    return Asset(code, issuer)


class StellarPathService:
    def __init__(self, horizon_url: str = HORIZON_TESTNET_URL):
        self.server = Server(horizon_url=horizon_url)

    def find_strict_send_paths(
        self,
        source_code: str,
        source_issuer: str | None,
        dest_code: str,
        dest_issuer: str | None,
        send_amount: str,
    ) -> list[dict]:
        """
        Ask Horizon for every viable route between source_asset and dest_asset
        for a fixed send amount, returning the resulting destination amount
        for each route the network can currently fill.
        """
        source_asset = _build_asset(source_code, source_issuer)
        dest_asset = _build_asset(dest_code, dest_issuer)

        try:
            response = (
                self.server.strict_send_paths(
                    source_asset=source_asset,
                    source_amount=send_amount,
                    destination=[dest_asset],
                )
                .call()
            )
        except NotFoundError:
            return []
        except BaseRequestError as exc:
            # Horizon unreachable, rate-limited, or returned a bad request.
            # Surface as "no route found" so the API layer degrades gracefully.
            raise RuntimeError(f"Horizon request failed: {exc}") from exc

        records = response.get("_embedded", {}).get("records", [])
        return records
