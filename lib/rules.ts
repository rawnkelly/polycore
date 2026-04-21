import { evaluateQuotes, formatSignedCents } from '@/lib/calculator';
import { formatCents, type Market } from '@/lib/markets';

export type RuleType =
  | 'yes-ask-lte'
  | 'no-ask-lte'
  | 'spread-lte'
  | 'spread-gte'
  | 'time-to-close-lte'
  | 'status-change'
  | 'yes-positive-ev'
  | 'no-positive-ev';

export type Rule = {
  id: string;
  name: string;
  ticker: string;
  type: RuleType;
  threshold: string;
  fairYes: string;
  bankroll: string;
  feeMode: 'kalshi' | 'custom' | 'no-fee' | 'polymarket';
  customFeeCents: string;
  isEnabled: boolean;
};

export const RULES_STORAGE_KEY = 'polycore.rules.v2';
export const RULE_EVENTS_STORAGE_KEY = 'polycore.rule-events.v2';
export const RULE_REFRESH_STORAGE_KEY = 'polycore.rule-refresh.v2';

export const DEFAULT_RULE: Rule = {
  id: '',
  name: 'YES becomes positive EV',
  ticker: 'DEMO-GDP-2026',
  type: 'yes-positive-ev',
  threshold: '50',
  fairYes: '54',
  bankroll: '1000',
  feeMode: 'kalshi',
  customFeeCents: '1',
  isEnabled: true,
};

export function normalizeRule(raw: unknown): Rule {
  const value = raw as Partial<Rule>;
  return {
    id: typeof value.id === 'string' && value.id.trim() ? value.id.trim() : `rule-${Date.now()}`,
    name: typeof value.name === 'string' && value.name.trim() ? value.name.trim() : 'Imported rule',
    ticker: typeof value.ticker === 'string' ? value.ticker.trim().toUpperCase() : '',
    type: isRuleType(value.type) ? value.type : 'yes-positive-ev',
    threshold: String(value.threshold ?? ''),
    fairYes: String(value.fairYes ?? '50'),
    bankroll: String(value.bankroll ?? '1000'),
    feeMode: isFeeMode(value.feeMode) ? value.feeMode : 'kalshi',
    customFeeCents: String(value.customFeeCents ?? '1'),
    isEnabled: value.isEnabled !== false,
  };
}

export function parseRulesImport(text: string): Rule[] {
  const parsed = JSON.parse(text) as unknown;
  const items = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as { rules?: unknown[] }).rules)
      ? (parsed as { rules: unknown[] }).rules
      : [];

  return items.map(normalizeRule).filter((rule) => rule.ticker);
}

export function serializeRules(rules: Rule[]): string {
  return JSON.stringify({ rules }, null, 2);
}

export function ruleTypeLabel(type: RuleType): string {
  switch (type) {
    case 'yes-ask-lte':
      return 'YES ask <= X';
    case 'no-ask-lte':
      return 'NO ask <= X';
    case 'spread-lte':
      return 'Spread <= X';
    case 'spread-gte':
      return 'Spread >= X';
    case 'time-to-close-lte':
      return 'Time to close <= X minutes';
    case 'status-change':
      return 'Status changes';
    case 'yes-positive-ev':
      return 'YES becomes positive EV';
    case 'no-positive-ev':
      return 'NO becomes positive EV';
    default:
      return type;
  }
}

export function evaluateRule(rule: Rule, market: Market, previousStatus: string | null): string | null {
  const threshold = Number(rule.threshold) || 0;

  if (rule.type === 'yes-ask-lte') {
    return market.yesAskCents !== null && market.yesAskCents <= threshold
      ? `YES ask ${formatCents(market.yesAskCents)} <= ${formatCents(threshold)}`
      : null;
  }

  if (rule.type === 'no-ask-lte') {
    return market.noAskCents !== null && market.noAskCents <= threshold
      ? `NO ask ${formatCents(market.noAskCents)} <= ${formatCents(threshold)}`
      : null;
  }

  if (rule.type === 'spread-lte') {
    return market.yesSpreadCents !== null && market.yesSpreadCents <= threshold
      ? `Spread ${formatCents(market.yesSpreadCents)} <= ${formatCents(threshold)}`
      : null;
  }

  if (rule.type === 'spread-gte') {
    return market.yesSpreadCents !== null && market.yesSpreadCents >= threshold
      ? `Spread ${formatCents(market.yesSpreadCents)} >= ${formatCents(threshold)}`
      : null;
  }

  if (rule.type === 'time-to-close-lte') {
    if (!market.closeTime) return null;
    const diffMinutes = Math.floor((new Date(market.closeTime).getTime() - Date.now()) / 60000);
    return diffMinutes >= 0 && diffMinutes <= threshold ? `Time to close ${diffMinutes}m <= ${threshold}m` : null;
  }

  if (rule.type === 'status-change') {
    return previousStatus !== null && previousStatus !== market.status
      ? `Status changed ${previousStatus} → ${market.status}`
      : null;
  }

  const evaluated = evaluateQuotes({
    fairYesProbability: Number(rule.fairYes) || 50,
    bankroll: Number(rule.bankroll) || 1000,
    feeMode: rule.feeMode,
    customFeeCents: Number(rule.customFeeCents) || 0,
    sizingMode: 'quarter-kelly',
    fixedDollarSize: 100,
    fixedMaxLoss: 100,
    fixedBankrollRiskPercent: 2,
    kellyCapPercent: 25,
    yesBid: market.yesBidCents,
    yesAsk: market.yesAskCents,
    noBid: market.noBidCents,
    noAsk: market.noAskCents,
  });

  if (rule.type === 'yes-positive-ev') {
    return evaluated.yes.price !== null && evaluated.yes.netEv > 0
      ? `YES is positive EV at ${formatCents(evaluated.yes.price)} (${formatSignedCents(evaluated.yes.netEv)})`
      : null;
  }

  if (rule.type === 'no-positive-ev') {
    return evaluated.no.price !== null && evaluated.no.netEv > 0
      ? `NO is positive EV at ${formatCents(evaluated.no.price)} (${formatSignedCents(evaluated.no.netEv)})`
      : null;
  }

  return null;
}

function isRuleType(value: unknown): value is RuleType {
  return typeof value === 'string' && [
    'yes-ask-lte',
    'no-ask-lte',
    'spread-lte',
    'spread-gte',
    'time-to-close-lte',
    'status-change',
    'yes-positive-ev',
    'no-positive-ev',
  ].includes(value);
}

function isFeeMode(value: unknown): value is Rule['feeMode'] {
  return value === 'kalshi' || value === 'custom' || value === 'no-fee' || value === 'polymarket';
}
