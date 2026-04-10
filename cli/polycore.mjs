#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const API_BASE = 'https://api.elections.kalshi.com/trade-api/v2';
function usage() {
  console.log(`PolyCore CLI

Usage:
  node ./cli/polycore.mjs watch --tickers T1,T2 [--refresh 10] [--once]
  node ./cli/polycore.mjs watch --file ./watchlists/default.json [--once]
  node ./cli/polycore.mjs monitor --tickers T1,T2 [--refresh 8]
`);
}
function parseArgs(argv) {
  const args = { command: argv[2] ?? 'watch', tickers: '', file: '', refresh: 10, once: false };
  for (let i = 3; i < argv.length; i += 1) {
    const current = argv[i], next = argv[i + 1];
    if (current === '--tickers') { args.tickers = next ?? ''; i += 1; }
    else if (current === '--file') { args.file = next ?? ''; i += 1; }
    else if (current === '--refresh') { args.refresh = Math.max(5, Number(next) || 10); i += 1; }
    else if (current === '--once') { args.once = true; }
    else if (current === '--help' || current === '-h') { usage(); process.exit(0); }
  }
  return args;
}
function readTickers(args) {
  if (args.tickers) return args.tickers.split(',').map((ticker) => ticker.trim()).filter(Boolean);
  if (args.file) {
    const parsed = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), args.file), 'utf8'));
    if (!Array.isArray(parsed)) throw new Error('Watchlist file must be a JSON array of tickers.');
    return parsed.map((ticker) => String(ticker).trim()).filter(Boolean);
  }
  throw new Error('Provide --tickers or --file.');
}
function cents(value) { if (value === null || value === undefined || value === '') return null; const parsed = Number(value); return Number.isFinite(parsed) ? parsed * 100 : null; }
function closeCountdown(value) {
  if (!value) return '--';
  const diff = new Date(value).getTime() - Date.now();
  if (diff <= 0) return 'Closed';
  const totalMinutes = Math.floor(diff / 60000), days = Math.floor(totalMinutes / 1440), hours = Math.floor((totalMinutes % 1440) / 60), minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`; if (hours > 0) return `${hours}h ${minutes}m`; return `${minutes}m`;
}
function fmtCents(value) { return value === null ? '--' : `${Math.round(value)}¢`; }
function pad(value, width) { const text = String(value); return text.length >= width ? text.slice(0, width) : text + ' '.repeat(width - text.length); }
function fmtTitle(value) { return String(value ?? '--').length > 34 ? `${String(value).slice(0, 31)}...` : String(value ?? '--'); }
async function fetchMarkets(tickers) {
  const response = await fetch(`${API_BASE}/markets?tickers=${encodeURIComponent(tickers.join(','))}`, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Kalshi request failed with ${response.status}`);
  const payload = await response.json();
  return Array.isArray(payload.markets) ? payload.markets.map((market) => ({
    ticker: market.ticker, title: market.title, status: market.status,
    yesBid: cents(market.yes_bid_dollars), yesAsk: cents(market.yes_ask_dollars),
    noBid: cents(market.no_bid_dollars), noAsk: cents(market.no_ask_dollars),
    spread: cents(market.yes_ask_dollars) !== null && cents(market.yes_bid_dollars) !== null ? cents(market.yes_ask_dollars) - cents(market.yes_bid_dollars) : null,
    last: cents(market.last_price_dollars), closeTime: market.close_time, countdown: closeCountdown(market.close_time),
  })) : [];
}
function render(markets, refresh, mode) {
  console.clear();
  console.log(`PolyCore ${mode} | refresh ${refresh}s | updated ${new Date().toLocaleTimeString()} | rows ${markets.length}`);
  console.log('');
  console.log([pad('TICKER', 22), pad('TITLE', 34), pad('STATUS', 8), pad('YB', 6), pad('YA', 6), pad('NB', 6), pad('NA', 6), pad('SPRD', 6), pad('LAST', 6), pad('LEFT', 10)].join('  '));
  console.log('-'.repeat(126));
  for (const market of markets) {
    console.log([pad(market.ticker, 22), pad(fmtTitle(market.title), 34), pad(market.status ?? '--', 8), pad(fmtCents(market.yesBid), 6), pad(fmtCents(market.yesAsk), 6), pad(fmtCents(market.noBid), 6), pad(fmtCents(market.noAsk), 6), pad(fmtCents(market.spread), 6), pad(fmtCents(market.last), 6), pad(market.countdown, 10)].join('  '));
  }
}
async function run() {
  const args = parseArgs(process.argv);
  if (!['watch', 'monitor'].includes(args.command)) { usage(); process.exit(1); }
  const tickers = readTickers(args);
  const loop = async () => render(await fetchMarkets(tickers), args.refresh, args.command);
  if (args.once) { await loop(); return; }
  await loop(); setInterval(loop, args.refresh * 1000);
}
run().catch((error) => { console.error(`PolyCore CLI error: ${error.message}`); process.exit(1); });
