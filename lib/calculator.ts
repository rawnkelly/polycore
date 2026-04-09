export type SideKey = 'yes' | 'no';

export type Inputs = {
  yesPrice: string;
  noPrice: string;
  fairYesProbability: string;
  bankroll: string;
  fee: string;
  kellyCapPercent: string;
  precision: number;
};

export type SideResult = {
  side: SideKey;
  label: 'Buy YES' | 'Buy NO';
  isAvailable: boolean;
  price: number;
  fairProbability: number;
  risk: number;
  profit: number;
  loss: number;
  breakEvenProbability: number;
  grossEdge: number;
  netEdge: number;
  grossEv: number;
  netEv: number;
  roiOnRisk: number;
  fullKellyFraction: number;
  cappedKellyFraction: number;
  suggestedSize: number;
};

export type CalculatorState = {
  parsed: {
    fairYes: number;
    fairNo: number;
    bankroll: number;
    fee: number;
    kellyCapFraction: number;
  } | null;
  errors: string[];
  yes: SideResult;
  no: SideResult;
  bestSide: SideKey | null;
  bothNegative: boolean;
};

const DEFAULT_SIDE_RESULT = (side: SideKey): SideResult => ({
  side,
  label: side === 'yes' ? 'Buy YES' : 'Buy NO',
  isAvailable: false,
  price: 0,
  fairProbability: 0,
  risk: 0,
  profit: 0,
  loss: 0,
  breakEvenProbability: 0,
  grossEdge: 0,
  netEdge: 0,
  grossEv: 0,
  netEv: 0,
  roiOnRisk: 0,
  fullKellyFraction: 0,
  cappedKellyFraction: 0,
  suggestedSize: 0,
});

function parseOptionalNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function calculateSide(params: {
  side: SideKey;
  price: number | null;
  fairProbability: number;
  fee: number;
  bankroll: number;
  kellyCapFraction: number;
}): SideResult {
  const base = DEFAULT_SIDE_RESULT(params.side);

  if (params.price === null) {
    return base;
  }

  const risk = params.price + params.fee;
  const profit = 100 - params.price - params.fee;
  const loss = params.price + params.fee;
  const grossEv = params.fairProbability * (100 - params.price) - (1 - params.fairProbability) * params.price;
  const netEv = params.fairProbability * profit - (1 - params.fairProbability) * loss;
  const breakEvenProbability = risk / 100;
  const grossEdge = params.fairProbability * 100 - params.price;
  const netEdge = params.fairProbability * 100 - risk;
  const roiOnRisk = risk > 0 ? netEv / risk : 0;

  let fullKellyFraction = 0;
  if (loss > 0 && profit > 0) {
    const b = profit / loss;
    fullKellyFraction = clamp((b * params.fairProbability - (1 - params.fairProbability)) / b, 0, Number.POSITIVE_INFINITY);
  }

  const cappedKellyFraction = Math.min(fullKellyFraction, params.kellyCapFraction);
  const suggestedSize = params.bankroll * cappedKellyFraction;

  return {
    side: params.side,
    label: params.side === 'yes' ? 'Buy YES' : 'Buy NO',
    isAvailable: true,
    price: params.price,
    fairProbability: params.fairProbability,
    risk,
    profit,
    loss,
    breakEvenProbability,
    grossEdge,
    netEdge,
    grossEv,
    netEv,
    roiOnRisk,
    fullKellyFraction,
    cappedKellyFraction,
    suggestedSize,
  };
}

export function calculate(inputs: Inputs): CalculatorState {
  const errors: string[] = [];

  const yesPrice = parseOptionalNumber(inputs.yesPrice);
  const noPrice = parseOptionalNumber(inputs.noPrice);
  const fairYes = parseOptionalNumber(inputs.fairYesProbability);
  const bankroll = parseOptionalNumber(inputs.bankroll);
  const fee = parseOptionalNumber(inputs.fee);
  const kellyCapPercent = parseOptionalNumber(inputs.kellyCapPercent);

  if (yesPrice === null && noPrice === null) {
    errors.push('Enter a YES price, a NO price, or both.');
  }

  if (yesPrice !== null && (yesPrice < 0 || yesPrice > 100)) {
    errors.push('YES buy price must be between 0 and 100 cents.');
  }

  if (noPrice !== null && (noPrice < 0 || noPrice > 100)) {
    errors.push('NO buy price must be between 0 and 100 cents.');
  }

  if (fairYes === null || fairYes < 0 || fairYes > 100) {
    errors.push('Fair YES probability must be between 0 and 100%.');
  }

  if (bankroll === null || bankroll <= 0) {
    errors.push('Bankroll must be greater than 0.');
  }

  if (fee === null || fee < 0) {
    errors.push('Estimated fee per contract must be 0 or more cents.');
  }

  if (kellyCapPercent === null || kellyCapPercent < 0) {
    errors.push('Kelly cap must be 0% or more.');
  }

  if (errors.length > 0 || fairYes === null || bankroll === null || fee === null || kellyCapPercent === null) {
    return {
      parsed: null,
      errors,
      yes: DEFAULT_SIDE_RESULT('yes'),
      no: DEFAULT_SIDE_RESULT('no'),
      bestSide: null,
      bothNegative: false,
    };
  }

  const fairYesFraction = fairYes / 100;
  const fairNoFraction = 1 - fairYesFraction;
  const kellyCapFraction = kellyCapPercent / 100;

  const yes = calculateSide({
    side: 'yes',
    price: yesPrice,
    fairProbability: fairYesFraction,
    fee,
    bankroll,
    kellyCapFraction,
  });

  const no = calculateSide({
    side: 'no',
    price: noPrice,
    fairProbability: fairNoFraction,
    fee,
    bankroll,
    kellyCapFraction,
  });

  const positiveCandidates = [yes, no].filter((side) => side.isAvailable && side.netEv > 0);

  let bestSide: SideKey | null = null;
  if (positiveCandidates.length > 0) {
    bestSide = positiveCandidates.sort((a, b) => b.netEv - a.netEv)[0].side;
  }

  const availableSides = [yes, no].filter((side) => side.isAvailable);
  const bothNegative = availableSides.length > 0 && availableSides.every((side) => side.netEv <= 0);

  return {
    parsed: {
      fairYes: fairYesFraction,
      fairNo: fairNoFraction,
      bankroll,
      fee,
      kellyCapFraction,
    },
    errors,
    yes,
    no,
    bestSide,
    bothNegative,
  };
}

export function formatNumber(value: number, precision: number): string {
  return value.toFixed(precision);
}

export function formatPercentFromFraction(value: number, precision: number): string {
  return `${(value * 100).toFixed(precision)}%`;
}

export function formatPercent(value: number, precision: number): string {
  return `${value.toFixed(precision)}%`;
}

export function formatCurrency(value: number, precision: number): string {
  return `$${value.toFixed(precision)}`;
}

/* Suggested commit message: rebuild calculator as Next.js + TypeScript single-page utility */
