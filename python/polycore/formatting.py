from __future__ import annotations

from datetime import datetime, timezone


UTC = timezone.utc


def utc_now_iso() -> str:
    return datetime.now(tz=UTC).replace(microsecond=0).isoformat().replace('+00:00', 'Z')


def parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace('Z', '+00:00'))
    except ValueError:
        return None


def format_close_time(value: str | None) -> str:
    instant = parse_iso(value)
    if instant is None:
        return '--'
    return instant.astimezone(UTC).strftime('%Y-%m-%d %H:%M UTC')


def format_time_to_close(value: str | None, *, now: datetime | None = None) -> str:
    instant = parse_iso(value)
    if instant is None:
        return '--'

    current = now or datetime.now(tz=UTC)
    diff_seconds = int((instant - current).total_seconds())
    if diff_seconds <= 0:
        return 'Closed'

    total_minutes = diff_seconds // 60
    days, rem_minutes = divmod(total_minutes, 1440)
    hours, minutes = divmod(rem_minutes, 60)

    if days > 0:
        return f'{days}d {hours}h'
    if hours > 0:
        return f'{hours}h {minutes}m'
    return f'{minutes}m'


def fmt_cents(value: int | float | None) -> str:
    if value is None:
        return '--'
    return f'{round(float(value))}¢'
