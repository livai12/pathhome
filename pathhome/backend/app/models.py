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
