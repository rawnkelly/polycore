import { SAMPLE_MARKETS, type Market } from '@/lib/markets';

export type MarketFetchResult = {
  markets: Market[];
  isDemo: boolean;
  error: string;
  durationMs: number;
};

export async function fetchMarketsByTickers(tickers: string[]): Promise<MarketFetchResult> {
  const cleaned = tickers.map((ticker) => ticker.trim()).filter(Boolean);
  if (cleaned.length === 0) {
    return {
      markets: SAMPLE_MARKETS,
      isDemo: true,
      error: '',
      durationMs: 0,
    };
  }

  const startedAt = performance.now();

  try {
    const response = await fetch(`/api/kalshi/markets?tickers=${encodeURIComponent(cleaned.join(','))}`, {
      cache: 'no-store',
    });
    const payload = (await response.json()) as { markets?: Market[]; error?: string };

    if (!response.ok) {
      throw new Error(payload.error ?? 'Request failed');
    }

    const markets = Array.isArray(payload.markets) && payload.markets.length > 0 ? payload.markets : SAMPLE_MARKETS;

    return {
      markets,
      isDemo: !Array.isArray(payload.markets) || payload.markets.length === 0,
      error: '',
      durationMs: Math.round(performance.now() - startedAt),
    };
  } catch (error) {
    return {
      markets: SAMPLE_MARKETS,
      isDemo: true,
      error: error instanceof Error ? error.message : 'Unknown error',
      durationMs: Math.round(performance.now() - startedAt),
    };
  }
}
