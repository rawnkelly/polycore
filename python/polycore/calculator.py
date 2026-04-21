from __future__ import annotations

import math


VALID_FEE_MODES = {'kalshi', 'polymarket', 'no-fee', 'custom'}


def clamp(value: float, minimum: float, maximum: float) -> float:
    return min(max(value, minimum), maximum)


def fee_for_price_cents(price_cents: int | float, fee_mode: str, custom_fee_cents: float) -> float:
    price = float(price_cents)
    p = price / 100.0
    if fee_mode == 'no-fee':
        return 0.0
    if fee_mode == 'custom':
        return custom_fee_cents
    if fee_mode == 'polymarket':
        return 100.0 * (0.04 * p * (1.0 - p))
    return float(math.ceil(100.0 * (0.07 * p * (1.0 - p))))


def evaluate_side_net_ev(price_cents: int | None, fair_probability_pct: float, fee_mode: str, custom_fee_cents: float) -> float | None:
    if price_cents is None:
        return None
    fair = clamp(fair_probability_pct / 100.0, 0.0, 1.0)
    fee = fee_for_price_cents(price_cents, fee_mode, custom_fee_cents)
    return (100.0 * fair) - float(price_cents) - fee
