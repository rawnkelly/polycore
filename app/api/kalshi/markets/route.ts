import { NextRequest, NextResponse } from 'next/server';
import { normalizeMarket } from '@/lib/markets';

export const dynamic = 'force-dynamic';

const API_URL = 'https://api.elections.kalshi.com/trade-api/v2/markets';
const REQUEST_TIMEOUT_MS = 8000;

export async function GET(request: NextRequest) {
  const tickers = request.nextUrl.searchParams.get('tickers')?.trim() ?? '';
  if (!tickers) return NextResponse.json({ markets: [] });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${API_URL}?tickers=${encodeURIComponent(tickers)}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    if (!response.ok) {
      return NextResponse.json({ error: `Kalshi request failed with ${response.status}` }, { status: 502 });
    }

    const payload = (await response.json()) as { markets?: unknown[] };

    return NextResponse.json({
      markets: Array.isArray(payload.markets) ? payload.markets.map(normalizeMarket) : [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    clearTimeout(timeout);
  }
}
