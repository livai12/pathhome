from pydantic import BaseModel, Field
from typing import Optional


class RouteRequest(BaseModel):
    source_asset_code: str = Field(..., description="Asset code the sender holds, e.g. USDC")
    source_asset_issuer: Optional[str] = Field(
        None, description="Issuer account for the source asset. Leave empty for native XLM."
    )
    dest_asset_code: str = Field(..., description="Asset code the receiver will get, e.g. IDRT")
    dest_asset_issuer: Optional[str] = Field(
        None, description="Issuer account for the destination asset. Leave empty for native XLM."
    )
    send_amount: str = Field(..., description="Amount the sender wants to send, as a decimal string")


class RouteOption(BaseModel):
    path: list[str]
    source_amount: str
    dest_amount: str
    estimated_fee_percent: float
    settlement_seconds: int
    label: str


class RouteResponse(BaseModel):
    recommended: RouteOption
    alternatives: list[RouteOption]
    explanation: str
    baseline_traditional_fee_percent: float
    estimated_savings_percent: float


class QuoteHistoryItem(BaseModel):
    corridor: str
    send_amount: str
    dest_amount: str
    fee_percent: float


class PrepareTransactionRequest(BaseModel):
    sender_public_key: str = Field(..., description="Stellar public key (G...) of the connected wallet")
    recipient_public_key: str = Field(..., description="Stellar public key (G...) of the recipient")
    source_asset_code: str
    source_asset_issuer: Optional[str] = None
    dest_asset_code: str
    dest_asset_issuer: Optional[str] = None
    send_amount: str
    dest_min: str = Field(..., description="Minimum acceptable destination amount, from the chosen quote")


class PrepareTransactionResponse(BaseModel):
    xdr: str
    network_passphrase: str


class SubmitTransactionRequest(BaseModel):
    signed_xdr: str = Field(..., description="Base64 transaction envelope XDR, already signed by the wallet")


class SubmitTransactionResponse(BaseModel):
    hash: str
    successful: bool
    explorer_url: str
