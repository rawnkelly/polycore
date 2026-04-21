'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_NAV_LINKS, PolycoreShell } from '@/components/polycore-shell';
import { formatCurrency } from '@/lib/calculator';
import { fetchMarketsByTickers } from '@/lib/market-client';
import { formatCents, formatCompactNumber, statusTone, type Market } from '@/lib/markets';
import {
  DEFAULT_RULE,
  RULE_EVENTS_STORAGE_KEY,
  RULE_REFRESH_STORAGE_KEY,
  RULES_STORAGE_KEY,
  evaluateRule,
  parseRulesImport,
  ruleTypeLabel,
  serializeRules,
  type Rule,
} from '@/lib/rules';

type TriggerEvent = {
  id: string;
  ruleId: string;
  ruleName: string;
  ticker: string;
  message: string;
  triggeredAt: string;
  market: Market;
  fairYes: string;
  bankroll: string;
  feeMode: Rule['feeMode'];
  customFeeCents: string;
};

function calculatorHref(market: Market, fairYes: string, bankroll: string, feeMode: Rule['feeMode'], customFeeCents: string) {
  const params = new URLSearchParams({
    fairYesProbability: fairYes,
    bankroll,
    feeMode,
    customFeeCents,
    sizingMode: 'quarter-kelly',
    yesBid: String(market.yesBidCents ?? ''),
    yesAsk: String(market.yesAskCents ?? ''),
    noBid: String(market.noBidCents ?? ''),
    noAsk: String(market.noAskCents ?? ''),
    kellyCapPercent: '25',
  });
  return `/calculator?${params.toString()}`;
}

export default function RulesPage() {
  const [ruleDraft, setRuleDraft] = useState<Rule>({ ...DEFAULT_RULE });
  const [rules, setRules] = useState<Rule[]>([{ ...DEFAULT_RULE, id: 'demo-yes-ev' }]);
  const [events, setEvents] = useState<TriggerEvent[]>([]);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [isDemo, setIsDemo] = useState(true);
  const [error, setError] = useState('');
  const [refreshSeconds, setRefreshSeconds] = useState(10);
  const [importText, setImportText] = useState('');
  const [copied, setCopied] = useState('');
  const armedRef = useRef<Record<string, boolean>>({});
  const previousStatusesRef = useRef<Record<string, string>>({});

  useEffect(() => {
    const rawRules = window.localStorage.getItem(RULES_STORAGE_KEY);
    const rawEvents = window.localStorage.getItem(RULE_EVENTS_STORAGE_KEY);
    const rawRefresh = window.localStorage.getItem(RULE_REFRESH_STORAGE_KEY);

    if (rawRules) {
      try {
        const parsed = parseRulesImport(rawRules);
        if (parsed.length > 0) setRules(parsed);
      } catch {}
    }

    if (rawEvents) {
      try {
        const parsed = JSON.parse(rawEvents) as TriggerEvent[];
        if (Array.isArray(parsed)) setEvents(parsed);
      } catch {}
    }

    if (rawRefresh) {
      setRefreshSeconds(Math.max(5, Number(rawRefresh) || 10));
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(RULES_STORAGE_KEY, serializeRules(rules));
  }, [rules]);

  useEffect(() => {
    window.localStorage.setItem(RULE_EVENTS_STORAGE_KEY, JSON.stringify(events.slice(0, 100)));
  }, [events]);

  useEffect(() => {
    window.localStorage.setItem(RULE_REFRESH_STORAGE_KEY, String(refreshSeconds));
  }, [refreshSeconds]);

  const activeTickers = useMemo(
    () => Array.from(new Set(rules.filter((rule) => rule.isEnabled).map((rule) => rule.ticker.trim()).filter(Boolean))),
    [rules],
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const result = await fetchMarketsByTickers(activeTickers);
      if (cancelled) return;
      setMarkets(result.markets);
      setIsDemo(result.isDemo);
      setError(result.error);
    }

    load();
    const timer = window.setInterval(load, Math.max(5, refreshSeconds) * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeTickers, refreshSeconds]);

  useEffect(() => {
    if (markets.length === 0) return;

    const nextEvents: TriggerEvent[] = [];

    for (const market of markets) {
      const matchingRules = rules.filter((rule) => rule.isEnabled && rule.ticker === market.ticker);
      const previousStatus = previousStatusesRef.current[market.ticker] ?? null;

      for (const rule of matchingRules) {
        const message = evaluateRule(rule, market, previousStatus);
        const key = `${rule.id}:${market.ticker}`;

        if (message) {
          if (!armedRef.current[key]) {
            nextEvents.push({
              id: `${Date.now()}-${rule.id}-${market.ticker}`,
              ruleId: rule.id,
              ruleName: rule.name,
              ticker: market.ticker,
              message,
              triggeredAt: new Date().toLocaleTimeString(),
              market,
              fairYes: rule.fairYes,
              bankroll: rule.bankroll,
              feeMode: rule.feeMode,
              customFeeCents: rule.customFeeCents,
            });
            armedRef.current[key] = true;
          }
        } else {
          armedRef.current[key] = false;
        }
      }

      previousStatusesRef.current[market.ticker] = market.status;
    }

    if (nextEvents.length > 0) {
      setEvents((current) => [...nextEvents, ...current].slice(0, 60));
    }
  }, [markets, rules]);

  function resetDraft() {
    setRuleDraft({ ...DEFAULT_RULE, id: '' });
  }

  function saveRule() {
    if (!ruleDraft.name.trim() || !ruleDraft.ticker.trim()) {
      setError('Rule name and ticker are required.');
      return;
    }

    const nextRule: Rule = {
      ...ruleDraft,
      id: ruleDraft.id || `rule-${Date.now()}`,
      ticker: ruleDraft.ticker.trim().toUpperCase(),
      name: ruleDraft.name.trim(),
    };

    setRules((current) => {
      const index = current.findIndex((rule) => rule.id === nextRule.id);
      if (index === -1) return [nextRule, ...current];
      const copy = [...current];
      copy[index] = nextRule;
      return copy;
    });

    setError('');
    resetDraft();
  }

  function editRule(rule: Rule) {
    setRuleDraft(rule);
  }

  function duplicateRule(rule: Rule) {
    const nextRule = { ...rule, id: `rule-${Date.now()}`, name: `${rule.name} copy` };
    setRules((current) => [nextRule, ...current]);
  }

  function toggleRule(id: string) {
    setRules((current) => current.map((rule) => rule.id === id ? { ...rule, isEnabled: !rule.isEnabled } : rule));
    armedRef.current = {};
  }

  function removeRule(id: string) {
    setRules((current) => current.filter((rule) => rule.id !== id));
    armedRef.current = {};
  }

  function clearEvents() {
    setEvents([]);
  }

  async function copyRulesJson() {
    await navigator.clipboard.writeText(serializeRules(rules));
    setCopied('Copied rules JSON');
    window.setTimeout(() => setCopied(''), 1200);
  }

  function importRules() {
    try {
      const imported = parseRulesImport(importText);
      if (imported.length === 0) {
        setError('Import JSON did not contain any rules.');
        return;
      }
      setRules(imported);
      armedRef.current = {};
      previousStatusesRef.current = {};
      setError('');
    } catch {
      setError('Import JSON is invalid.');
    }
  }

  const activeRules = rules.filter((rule) => rule.isEnabled);
  const recentEvent = events[0] ?? null;

  return (
    <main className="page-shell">
      <PolycoreShell
        title="PolyCore / Rules"
        subtitle="Alert when your tracked market hits your line"
        footerTitle="Rules module inside the PolyCore toolkit by Lurk."
        footerCopy="Rules watch the market so the rest of PolyCore does not sit there like dead furniture."
        navLinks={DEFAULT_NAV_LINKS}
      >
        <header className="hero panel-surface">
          <div className="hero-copy-wrap">
            <p className="eyebrow">Rules module</p>
            <h1>Tell me when my rule hits.</h1>
            <p className="hero-copy">
              Save fee-aware EV rules, price thresholds, spread conditions, and countdown checks, then keep the triggered log ready for calculator handoff.
            </p>
            <div className="hero-actions">
              <button className="secondary-button" type="button" onClick={copyRulesJson}>{copied || 'Copy JSON'}</button>
              <button className="secondary-button" type="button" onClick={resetDraft}>New draft</button>
            </div>
          </div>
          <div className="hero-rail">
            <div className="info-chip"><span>Active rules</span><strong>{activeRules.length}</strong></div>
            <div className="info-chip"><span>Triggered events</span><strong>{events.length}</strong></div>
            <div className="info-chip"><span>Tracked tickers</span><strong>{activeTickers.length || markets.length}</strong></div>
            <div className="info-chip"><span>Feed</span><strong>{isDemo ? 'Sample mode' : `Every ${refreshSeconds}s`}</strong></div>
          </div>
        </header>

        {error ? <div className="error-box"><p>{error}</p></div> : null}

        <section className="controls-layout controls-layout-watchlist">
          <section className="section-frame panel-surface">
            <div className="section-head">
              <div>
                <p className="eyebrow">Create</p>
                <h2>Rule builder</h2>
                <p className="section-copy">One market, one condition, one reason to care.</p>
              </div>
              <div className="section-actions">
                <button className="secondary-button" type="button" onClick={saveRule}>{ruleDraft.id ? 'Update rule' : 'Save rule'}</button>
              </div>
            </div>

            <div className="control-grid control-grid-2">
              <label className="field"><span>Name</span><input value={ruleDraft.name} onChange={(event) => setRuleDraft((current) => ({ ...current, name: event.target.value }))} /></label>
              <label className="field"><span>Ticker</span><input list="rule-tickers" value={ruleDraft.ticker} onChange={(event) => setRuleDraft((current) => ({ ...current, ticker: event.target.value.toUpperCase() }))} /></label>
              <label className="field"><span>Rule type</span><select value={ruleDraft.type} onChange={(event) => setRuleDraft((current) => ({ ...current, type: event.target.value as Rule['type'] }))}><option value="yes-ask-lte">YES ask &lt;= X</option><option value="no-ask-lte">NO ask &lt;= X</option><option value="spread-lte">Spread &lt;= X</option><option value="spread-gte">Spread &gt;= X</option><option value="time-to-close-lte">Time to close &lt;= X minutes</option><option value="status-change">Status changes</option><option value="yes-positive-ev">YES becomes positive EV</option><option value="no-positive-ev">NO becomes positive EV</option></select></label>
              <label className="field"><span>Threshold</span><input value={ruleDraft.threshold} onChange={(event) => setRuleDraft((current) => ({ ...current, threshold: event.target.value }))} placeholder="Used for price / spread / minutes rules" /></label>
              <label className="field"><span>Fair YES (%)</span><input value={ruleDraft.fairYes} onChange={(event) => setRuleDraft((current) => ({ ...current, fairYes: event.target.value }))} /></label>
              <label className="field"><span>Bankroll ($)</span><input value={ruleDraft.bankroll} onChange={(event) => setRuleDraft((current) => ({ ...current, bankroll: event.target.value }))} /></label>
              <label className="field"><span>Fee mode</span><select value={ruleDraft.feeMode} onChange={(event) => setRuleDraft((current) => ({ ...current, feeMode: event.target.value as Rule['feeMode'] }))}><option value="kalshi">Kalshi</option><option value="custom">Custom</option><option value="no-fee">No fee</option><option value="polymarket">Polymarket</option></select></label>
              <label className="field"><span>Custom fee (¢)</span><input value={ruleDraft.customFeeCents} onChange={(event) => setRuleDraft((current) => ({ ...current, customFeeCents: event.target.value }))} /></label>
              <label className="field"><span>Refresh (seconds)</span><input value={String(refreshSeconds)} onChange={(event) => setRefreshSeconds(Math.max(5, Number(event.target.value) || 5))} /></label>
              <label className="field field-checkbox"><span>Enabled</span><input className="checkbox-input" type="checkbox" checked={ruleDraft.isEnabled} onChange={(event) => setRuleDraft((current) => ({ ...current, isEnabled: event.target.checked }))} /></label>
              <label className="field field-span-2"><span>Import JSON</span><textarea className="textarea" value={importText} onChange={(event) => setImportText(event.target.value)} placeholder='{"rules":[{"ticker":"DEMO-GDP-2026"}]}' /></label>
            </div>

            <div className="hero-actions">
              <button className="secondary-button" type="button" onClick={importRules}>Import rules</button>
            </div>

            <datalist id="rule-tickers">
              {markets.map((market) => <option key={market.ticker} value={market.ticker} />)}
            </datalist>
          </section>

          <section className="section-frame panel-surface">
            <div className="section-head"><div><p className="eyebrow">Engine</p><h2>Rules state</h2></div></div>
            <div className="metrics-grid">
              <div className="metric-row"><span>Enabled rules</span><strong>{activeRules.length}</strong></div>
              <div className="metric-row"><span>Total rules</span><strong>{rules.length}</strong></div>
              <div className="metric-row"><span>Tracked tickers</span><strong>{activeTickers.length || markets.length}</strong></div>
              <div className="metric-row"><span>Recent triggers</span><strong>{events.length}</strong></div>
              <div className="metric-row"><span>Suggested action</span><strong>{recentEvent ? 'Review latest trigger' : 'Waiting'}</strong></div>
              <div className="metric-row"><span>Rule bankroll basis</span><strong>{recentEvent ? formatCurrency(Number(recentEvent.bankroll) || 0) : '--'}</strong></div>
            </div>
          </section>
        </section>

        <section className="section-frame panel-surface rules-list-section">
          <div className="section-head"><div><p className="eyebrow">Saved rules</p><h2>Active rules</h2></div></div>
          <div className="rules-grid">
            {rules.map((rule) => (
              <section key={rule.id} className={`subpanel surface-soft rule-card ${rule.isEnabled ? '' : 'rule-card-disabled'}`}>
                <div className="subpanel-header">
                  <h3>{rule.name}</h3>
                  <span className={`status-pill ${rule.isEnabled ? 'status-positive' : 'status-muted'}`}>{rule.isEnabled ? 'Enabled' : 'Disabled'}</span>
                </div>
                <div className="metrics-grid">
                  <div className="metric-row"><span>Ticker</span><strong>{rule.ticker}</strong></div>
                  <div className="metric-row"><span>Type</span><strong>{ruleTypeLabel(rule.type)}</strong></div>
                  <div className="metric-row"><span>Threshold</span><strong>{rule.threshold || '--'}</strong></div>
                  <div className="metric-row"><span>Fair / bankroll</span><strong>{rule.fairYes}% / {formatCurrency(Number(rule.bankroll) || 0)}</strong></div>
                </div>
                <div className="hero-actions rules-actions">
                  <button className="secondary-button" type="button" onClick={() => editRule(rule)}>Edit</button>
                  <button className="secondary-button" type="button" onClick={() => duplicateRule(rule)}>Duplicate</button>
                  <button className="secondary-button" type="button" onClick={() => toggleRule(rule.id)}>{rule.isEnabled ? 'Disable' : 'Enable'}</button>
                  <button className="secondary-button" type="button" onClick={() => removeRule(rule.id)}>Delete</button>
                </div>
              </section>
            ))}
          </div>
        </section>

        <section className="section-frame panel-surface">
          <div className="section-head">
            <div>
              <p className="eyebrow">Triggered events</p>
              <h2>Triggered log</h2>
              <p className="section-copy">Latest hits stay here so you can inspect them, then launch the market straight into the calculator.</p>
            </div>
            <div className="section-actions"><button className="secondary-button" type="button" onClick={clearEvents}>Clear log</button></div>
          </div>
          <div className="table-wrap market-table-wrap">
            <table className="data-table market-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Rule</th>
                  <th>Ticker</th>
                  <th>Message</th>
                  <th>Status</th>
                  <th>YES ask</th>
                  <th>Spread</th>
                  <th>Volume</th>
                  <th>Calc</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id}>
                    <td>{event.triggeredAt}</td>
                    <td>{event.ruleName}</td>
                    <td className="ticker-cell">{event.ticker}</td>
                    <td>{event.message}</td>
                    <td><span className={`status-pill status-${statusTone(event.market.status)}`}>{event.market.status}</span></td>
                    <td>{formatCents(event.market.yesAskCents)}</td>
                    <td>{formatCents(event.market.yesSpreadCents)}</td>
                    <td>{formatCompactNumber(event.market.volume24h)}</td>
                    <td><Link className="table-link" href={calculatorHref(event.market, event.fairYes, event.bankroll, event.feeMode, event.customFeeCents)}>Price it</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </PolycoreShell>
    </main>
  );
}
