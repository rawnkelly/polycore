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
  node ./cli/polycore.mjs rules --file ./watchlists/rules.json [--refresh 10]
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
function readRules(args) {
  if (!args.file) throw new Error('Provide --file for rules.');
  const parsed = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), args.file), 'utf8'));
  if (!Array.isArray(parsed)) throw new Error('Rules file must be a JSON array of rules.');
  return parsed;
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
function evaluateRule(rule, market, previousStatus) {
  const threshold = Number(rule.threshold) || 0;
  if (rule.type === 'yes-ask-lte') return market.yesAsk !== null && market.yesAsk <= threshold ? `YES ask ${fmtCents(market.yesAsk)} <= ${fmtCents(threshold)}` : null;
  if (rule.type === 'no-ask-lte') return market.noAsk !== null && market.noAsk <= threshold ? `NO ask ${fmtCents(market.noAsk)} <= ${fmtCents(threshold)}` : null;
  if (rule.type === 'spread-lte') return market.spread !== null && market.spread <= threshold ? `Spread ${fmtCents(market.spread)} <= ${fmtCents(threshold)}` : null;
  if (rule.type === 'spread-gte') return market.spread !== null && market.spread >= threshold ? `Spread ${fmtCents(market.spread)} >= ${fmtCents(threshold)}` : null;
  if (rule.type === 'time-to-close-lte') {
    if (!market.closeTime) return null;
    const diffMinutes = Math.floor((new Date(market.closeTime).getTime() - Date.now()) / 60000);
    return diffMinutes >= 0 && diffMinutes <= threshold ? `Time to close ${diffMinutes}m <= ${threshold}m` : null;
  }
  if (rule.type === 'status-change') return previousStatus !== null && previousStatus !== market.status ? `Status changed ${previousStatus} -> ${market.status}` : null;
  if (rule.type === 'yes-positive-ev') return market.yesAsk !== null && (Number(rule.fairYes || 50) - market.yesAsk / 100) > 0 ? `YES may be +EV at ${fmtCents(market.yesAsk)}` : null;
  if (rule.type === 'no-positive-ev') return market.noAsk !== null && ((100 - Number(rule.fairYes || 50)) / 100 - market.noAsk / 100) > 0 ? `NO may be +EV at ${fmtCents(market.noAsk)}` : null;
  return null;
}
function renderRules(events, refresh) {
  console.clear();
  console.log(`PolyCore rules | refresh ${refresh}s | updated ${new Date().toLocaleTimeString()} | triggered ${events.length}`);
  console.log('');
  console.log([pad('TIME', 12), pad('RULE', 28), pad('TICKER', 22), 'MESSAGE'].join('  '));
  console.log('-'.repeat(120));
  for (const event of events) {
    console.log([pad(event.triggeredAt, 12), pad(event.ruleName, 28), pad(event.ticker, 22), event.message].join('  '));
  }
}
async function run() {
  const args = parseArgs(process.argv);
  if (!['watch', 'monitor', 'rules'].includes(args.command)) { usage(); process.exit(1); }

  if (args.command === 'rules') {
    const rules = readRules(args);
    const tickers = [...new Set(rules.filter((rule) => rule.isEnabled !== false).map((rule) => rule.ticker).filter(Boolean))];
    let previousStatuses = {};
    let armed = {};
    const loop = async () => {
      const markets = await fetchMarkets(tickers);
      const events = [];
      for (const market of markets) {
        const matchingRules = rules.filter((rule) => rule.isEnabled !== false && rule.ticker === market.ticker);
        const previousStatus = previousStatuses[market.ticker] ?? null;
        for (const rule of matchingRules) {
          const message = evaluateRule(rule, market, previousStatus);
          const key = `${rule.id || rule.name}:${market.ticker}`;
          if (message) {
            if (!armed[key]) {
              events.push({ triggeredAt: new Date().toLocaleTimeString(), ruleName: rule.name || rule.type, ticker: market.ticker, message });
              armed[key] = true;
            }
          } else {
            armed[key] = false;
          }
        }
        previousStatuses[market.ticker] = market.status;
      }
      renderRules(events, args.refresh);
    };
    if (args.once) { await loop(); return; }
    await loop(); setInterval(loop, args.refresh * 1000); return;
  }

  const tickers = readTickers(args);
  const loop = async () => render(await fetchMarkets(tickers), args.refresh, args.command);
  if (args.once) { await loop(); return; }
  await loop(); setInterval(loop, args.refresh * 1000);
}
run().catch((error) => { console.error(`PolyCore CLI error: ${error.message}`); process.exit(1); });
