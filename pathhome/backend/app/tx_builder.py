"""
Builds unsigned Stellar transactions for the frontend to sign with a wallet
(Freighter), and submits signed transactions to Horizon.

The backend never holds a private key. It only assembles the transaction
envelope (using the sender's public key to read their current sequence
number) and later relays an already-signed envelope to Horizon. This keeps
PathHome non-custodial: at no point does the service have the ability to
move a user's funds on its own.
"""

from __future__ import annotations

from stellar_sdk import Asset, Network, Server, TransactionBuilder
from stellar_sdk.exceptions import BadRequestError, NotFoundError
from stellar_sdk.transaction_envelope import TransactionEnvelope

HORIZON_TESTNET_URL = "https://horizon-testnet.stellar.org"
BASE_FEE = 100


def _build_asset(code: str, issuer: str | None) -> Asset:
    if code.upper() == "XLM" and not issuer:
        return Asset.native()
    if not issuer:
        raise ValueError(f"Asset {code} requires an issuer account (native XLM is the only exception)")
    return Asset(code, issuer)


class StellarTransactionService:
    def __init__(self, horizon_url: str = HORIZON_TESTNET_URL):
        self.server = Server(horizon_url=horizon_url)
        self.network_passphrase = Network.TESTNET_NETWORK_PASSPHRASE

    def build_path_payment_xdr(
        self,
        sender_public_key: str,
        recipient_public_key: str,
        source_code: str,
        source_issuer: str | None,
        dest_code: str,
        dest_issuer: str | None,
        send_amount: str,
        dest_min: str,
    ) -> str:
        """
        Assemble an unsigned strict-send path payment transaction and return
        it as a base64 XDR envelope, ready for a wallet to sign.
        """
        try:
            source_account = self.server.load_account(sender_public_key)
        except NotFoundError as exc:
            raise RuntimeError(
                f"Account {sender_public_key} was not found on testnet. "
                "It needs to be created/funded (e.g. via Friendbot) before it can transact."
            ) from exc

        send_asset = _build_asset(source_code, source_issuer)
        dest_asset = _build_asset(dest_code, dest_issuer)

        transaction = (
            TransactionBuilder(
                source_account=source_account,
                network_passphrase=self.network_passphrase,
                base_fee=BASE_FEE,
            )
            .append_path_payment_strict_send_op(
                destination=recipient_public_key,
                send_asset=send_asset,
                send_amount=send_amount,
                dest_asset=dest_asset,
                dest_min=dest_min,
                path=[],
            )
            .set_timeout(300)
            .build()
        )
        return transaction.to_xdr()

    def submit_signed_xdr(self, signed_xdr: str) -> dict:
        """
        Relay an already-signed transaction envelope to Horizon. The backend
        performs no signing here — it only forwards what the wallet produced.
        """
        envelope = TransactionEnvelope.from_xdr(signed_xdr, network_passphrase=self.network_passphrase)
        try:
            response = self.server.submit_transaction(envelope)
        except BadRequestError as exc:
            raise RuntimeError(f"Horizon rejected the transaction: {exc}") from exc
        return response
