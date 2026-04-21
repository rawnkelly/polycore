from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Any

from .models import Market, Rule, Snapshot


def ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def load_json(path: str | Path) -> Any:
    return json.loads(Path(path).read_text(encoding='utf-8'))


def dump_json(path: str | Path, payload: Any) -> None:
    output = Path(path)
    ensure_parent(output)
    output.write_text(json.dumps(payload, indent=2), encoding='utf-8')


def load_watchlist_tickers(path: str | Path) -> list[str]:
    payload = load_json(path)
    if isinstance(payload, list):
        values = payload
    elif isinstance(payload, dict) and isinstance(payload.get('tickers'), list):
        values = payload.get('tickers', [])
    else:
        raise ValueError('Watchlist file must be a JSON array or an object with a tickers array.')

    tickers: list[str] = []
    seen: set[str] = set()
    for raw in values:
        ticker = str(raw).strip().upper()
        if ticker and ticker not in seen:
            tickers.append(ticker)
            seen.add(ticker)
    return tickers


def _normalize_rule(raw: dict[str, Any], index: int) -> Rule:
    return Rule(
        id=str(raw.get('id') or f'rule-{index + 1}').strip(),
        name=str(raw.get('name') or 'Imported rule').strip(),
        ticker=str(raw.get('ticker') or '').strip().upper(),
        type=str(raw.get('type') or 'yes-positive-ev').strip(),
        threshold=str(raw.get('threshold') or ''),
        fair_yes=str(raw.get('fairYes') or raw.get('fair_yes') or '50'),
        bankroll=str(raw.get('bankroll') or '1000'),
        fee_mode=str(raw.get('feeMode') or raw.get('fee_mode') or 'kalshi'),
        custom_fee_cents=str(raw.get('customFeeCents') or raw.get('custom_fee_cents') or '1'),
        is_enabled=bool(raw.get('isEnabled', raw.get('is_enabled', True))),
    )


def load_rules(path: str | Path) -> list[Rule]:
    payload = load_json(path)
    rows = payload if isinstance(payload, list) else payload.get('rules', []) if isinstance(payload, dict) else []
    if not isinstance(rows, list):
        raise ValueError('Rules file must be a JSON array or an object with a rules array.')
    return [rule for index, raw in enumerate(rows) if isinstance(raw, dict) and (rule := _normalize_rule(raw, index)).ticker]


def load_snapshot(path: str | Path) -> Snapshot:
    payload = load_json(path)
    markets = [
        Market(
            ticker=str(raw['ticker']),
            title=str(raw.get('title') or ''),
            status=str(raw.get('status') or 'unknown'),
            yes_bid_cents=raw.get('yes_bid_cents'),
            yes_ask_cents=raw.get('yes_ask_cents'),
            no_bid_cents=raw.get('no_bid_cents'),
            no_ask_cents=raw.get('no_ask_cents'),
            last_price_cents=raw.get('last_price_cents'),
            midpoint_cents=raw.get('midpoint_cents'),
            yes_spread_cents=raw.get('yes_spread_cents'),
            close_time=raw.get('close_time'),
            close_time_label=str(raw.get('close_time_label') or '--'),
            time_to_close_label=str(raw.get('time_to_close_label') or '--'),
            volume24h=raw.get('volume24h'),
            updated_at=str(raw.get('updated_at') or payload.get('capturedAt') or ''),
        )
        for raw in payload.get('markets', [])
        if isinstance(raw, dict) and raw.get('ticker')
    ]
    return Snapshot(
        captured_at=str(payload.get('capturedAt') or ''),
        source=str(payload.get('source') or 'unknown'),
        tickers=[str(ticker) for ticker in payload.get('tickers', [])],
        warning=str(payload.get('warning') or ''),
        meta=payload.get('meta') if isinstance(payload.get('meta'), dict) else {},
        markets=markets,
    )


def write_snapshot_json(path: str | Path, snapshot: Snapshot) -> None:
    dump_json(path, snapshot.to_dict())


def write_markets_csv(path: str | Path, markets: list[Market]) -> None:
    output = Path(path)
    ensure_parent(output)
    with output.open('w', encoding='utf-8', newline='') as handle:
        writer = csv.writer(handle)
        writer.writerow([
            'ticker', 'title', 'status', 'yes_bid_cents', 'yes_ask_cents', 'no_bid_cents', 'no_ask_cents',
            'last_price_cents', 'midpoint_cents', 'yes_spread_cents', 'close_time', 'close_time_label',
            'time_to_close_label', 'volume24h', 'updated_at',
        ])
        for market in markets:
            writer.writerow([
                market.ticker, market.title, market.status, market.yes_bid_cents, market.yes_ask_cents,
                market.no_bid_cents, market.no_ask_cents, market.last_price_cents, market.midpoint_cents,
                market.yes_spread_cents, market.close_time, market.close_time_label, market.time_to_close_label,
                market.volume24h, market.updated_at,
            ])


def append_market_timelines(directory: str | Path, snapshot: Snapshot) -> list[Path]:
    base = Path(directory)
    base.mkdir(parents=True, exist_ok=True)
    touched: list[Path] = []
    for market in snapshot.markets:
        output = base / f'{market.ticker}.jsonl'
        with output.open('a', encoding='utf-8') as handle:
            handle.write(json.dumps({
                'capturedAt': snapshot.captured_at,
                'source': snapshot.source,
                'warning': snapshot.warning,
                'market': market.to_dict(),
            }) + '\n')
        touched.append(output)
    return touched
