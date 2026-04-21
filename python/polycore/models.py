from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass(slots=True)
class Market:
    ticker: str
    title: str
    status: str
    yes_bid_cents: int | None
    yes_ask_cents: int | None
    no_bid_cents: int | None
    no_ask_cents: int | None
    last_price_cents: int | None
    midpoint_cents: float | None
    yes_spread_cents: int | None
    close_time: str | None
    close_time_label: str
    time_to_close_label: str
    volume24h: float | None
    updated_at: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(slots=True)
class Rule:
    id: str
    name: str
    ticker: str
    type: str
    threshold: str = ''
    fair_yes: str = '50'
    bankroll: str = '1000'
    fee_mode: str = 'kalshi'
    custom_fee_cents: str = '1'
    is_enabled: bool = True

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(slots=True)
class RuleEvent:
    rule_id: str
    rule_name: str
    ticker: str
    message: str
    status: str
    occurred_at: str
    market: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(slots=True)
class Snapshot:
    captured_at: str
    source: str
    tickers: list[str]
    markets: list[Market]
    warning: str = ''
    meta: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            'capturedAt': self.captured_at,
            'source': self.source,
            'tickers': self.tickers,
            'warning': self.warning,
            'meta': self.meta,
            'markets': [market.to_dict() for market in self.markets],
        }
