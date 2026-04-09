export type SideKey = 'yes' | 'no';
export type PricingMode = 'single' | 'quote';
export type FeeMode = 'no-fee' | 'polymarket' | 'kalshi' | 'custom';
export type SizingMode =
  | 'full-kelly'
  | 'half-kelly'
  | 'quarter-kelly'
  | 'fixed-dollar'
  | 'fixed-max-loss'
  | 'fixed-bankroll-risk';

export type Inputs = {
  pricingMode: PricingMode;
  yesPrice: string;
  noPrice: string;
  yesBid: string;
  yesAsk: string;
  noBid: string;
  noAsk: string;
  fairYesProbability: string;
  bankroll: string;
  feeMode: FeeMode;
  fee: string;
  kellyCapPercent: string;
  sizingMode: SizingMode;
  fixedDollarSize: string;
  fixedMaxLoss: string;
  fixedBankrollRiskPercent: string;
  reverseDesiredEv: string;
  reverseDesiredRoi: string;
  precision: number;
};

export type PricingReference = {
  bid: number | null;
  ask: number | null;
  midpoint: number | null;
  spread: number | null;
  activeEntryPrice: number | null;
  bidReferenceEv: number | null;
  midpointEv: number | null;
};

export type EntryTargets = {
  maxWorthPaying: number;
  zeroEvPrice: number;
  roi5Price: number;
  roi10Price: number;
  roi20Price: number;
};

export type ScenarioRow = {
  label: string;
  fairProbability: number;
  netEv: number;
  edge: number;
};

export type SlippageRow = {
  label: string;
  price: number;
  netEv: number;
  roiOnRisk: number;
};

export type PositionOutput = {
  sizingModeLabel: string;
  suggestedDollars: number;
  suggestedContractsRaw: number;
  suggestedContracts: number;
  maxLossDollars: number;
  maxWinDollars: number;
};

export type SideResult = {
  side: SideKey;
  label: 'Buy YES' | 'Buy NO';
  isAvailable: boolean;
  price: number;
  fairProbability: number;
  fairProbabilityNeeded: number;
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
  pricingReference: PricingReference;
  entryTargets: EntryTargets;
  scenarioRows: ScenarioRow[];
  slippageRows: SlippageRow[];
  position: PositionOutput;
  feePerContract: number;
};

export type ReverseCalculatorOutput = {
  targetEvCents: number;
  targetRoiFraction: number;
  yesMaxForEv: number;
  noMaxForEv: number;
  yesMaxForRoi: number;
  noMaxForRoi: number;
};

export type CalculatorState = {
  parsed: {
    fairYes: number;
    fairNo: number;
    bankroll: number;
    kellyCapFraction: number;
    feeMode: FeeMode;
    sizingMode: SizingMode;
  } | null;
  errors: string[];
  yes: SideResult;
  no: SideResult;
  bestSide: SideKey | null;
  recommendation: 'buy-yes' | 'buy-no' | 'pass';
  recommendationLabel: string;
  reverse: ReverseCalculatorOutput | null;
};

const DEFAULT_PRICING_REFERENCE: PricingReference = {
  bid: null,
  ask: null,
  midpoint: null,
  spread: null,
  activeEntryPrice: null,
  bidReferenceEv: null,
  midpointEv: null,
};

const DEFAULT_POSITION = (): PositionOutput => ({
  sizingModeLabel: 'Awaiting valid inputs',
  suggestedDollars: 0,
  suggestedContractsRaw: 0,
  suggestedContracts: 0,
  maxLossDollars: 0,
  maxWinDollars: 0,
});

const DEFAULT_ENTRY_TARGETS: EntryTargets = {
  maxWorthPaying: 0,
  zeroEvPrice: 0,
  roi5Price: 0,
  roi10Price: 0,
  roi20Price: 0,
};

const DEFAULT_SIDE_RESULT = (side: SideKey): SideResult => ({
  side,
  label: side === 'yes' ? 'Buy YES' : 'Buy NO',
  isAvailable: false,
  price: 0,
  fairProbability: 0,
  fairProbabilityNeeded: 0,
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
  pricingReference: DEFAULT_PRICING_REFERENCE,
  entryTargets: DEFAULT_ENTRY_TARGETS,
  scenarioRows: [],
  slippageRows: [],
  position: DEFAULT_POSITION(),
  feePerContract: 0,
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

function round(value: number, precision = 4): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function ceilToCent(valueInDollars: number): number {
  return Math.ceil(valueInDollars * 100) / 100;
}

function getFeePerContractCents(params: {
  feeMode: FeeMode;
  customFeeCents: number;
  priceCents: number;
}): number {
  const priceDollars = params.priceCents / 100;

  switch (params.feeMode) {
    case 'no-fee':
      return 0;
    case 'custom':
      return params.customFeeCents;
    case 'kalshi': {
      const feeDollars = ceilToCent(0.07 * priceDollars * (1 - priceDollars));
      return round(feeDollars * 100, 2);
    }
    case 'polymarket': {
      const feeDollars = 0.04 * priceDollars * (1 - priceDollars);
      return round(feeDollars * 100, 4);
    }
    default:
      return params.customFeeCents;
  }
}

function getFairProbabilityForSide(side: SideKey, fairYes: number): number {
  return side === 'yes' ? fairYes : 1 - fairYes;
}

function getQuoteMetrics(bid: number | null, ask: number | null): Pick<PricingReference, 'bid' | 'ask' | 'midpoint' | 'spread' | 'activeEntryPrice'> {
  const midpoint = bid !== null && ask !== null ? (bid + ask) / 2 : null;
  const spread = bid !== null && ask !== null ? ask - bid : null;
  return {
    bid,
    ask,
    midpoint,
    spread,
    activeEntryPrice: ask,
  };
}

function computeNetEvCents(fairProbability: number, priceCents: number, feeCents: number): number {
  return 100 * fairProbability - priceCents - feeCents;
}

function computeGrossEvCents(fairProbability: number, priceCents: number): number {
  return 100 * fairProbability - priceCents;
}

function computeRoi(netEvCents: number, riskCents: number): number {
  return riskCents > 0 ? netEvCents / riskCents : 0;
}

function computeKelly(fairProbability: number, priceCents: number, feeCents: number): number {
  const risk = priceCents + feeCents;
  const profit = 100 - priceCents - feeCents;
  if (risk <= 0 || profit <= 0) {
    return 0;
  }

  const b = profit / risk;
  return clamp((b * fairProbability - (1 - fairProbability)) / b, 0, Number.POSITIVE_INFINITY);
}

function sizingModeLabel(mode: SizingMode): string {
  switch (mode) {
    case 'full-kelly':
      return 'Full Kelly';
    case 'half-kelly':
      return 'Half Kelly';
    case 'quarter-kelly':
      return 'Quarter Kelly';
    case 'fixed-dollar':
      return 'Fixed dollar size';
    case 'fixed-max-loss':
      return 'Fixed max loss';
    case 'fixed-bankroll-risk':
      return 'Fixed % bankroll risk';
    default:
      return 'Position sizing';
  }
}

function getSuggestedDollars(params: {
  side: SideResult;
  bankroll: number;
  sizingMode: SizingMode;
  fixedDollarSize: number;
  fixedMaxLoss: number;
  fixedBankrollRiskPercent: number;
}): number {
  switch (params.sizingMode) {
    case 'full-kelly':
      return params.bankroll * params.side.fullKellyFraction;
    case 'half-kelly':
      return params.bankroll * params.side.fullKellyFraction * 0.5;
    case 'quarter-kelly':
      return params.bankroll * params.side.fullKellyFraction * 0.25;
    case 'fixed-dollar':
      return params.fixedDollarSize;
    case 'fixed-max-loss':
      return params.fixedMaxLoss;
    case 'fixed-bankroll-risk':
      return params.bankroll * (params.fixedBankrollRiskPercent / 100);
    default:
      return params.bankroll * params.side.cappedKellyFraction;
  }
}

function buildPositionOutput(params: {
  side: SideResult;
  bankroll: number;
  sizingMode: SizingMode;
  fixedDollarSize: number;
  fixedMaxLoss: number;
  fixedBankrollRiskPercent: number;
}): PositionOutput {
  const suggestedDollars = Math.max(0, getSuggestedDollars(params));
  const riskPerContractDollars = params.side.risk / 100;
  const profitPerContractDollars = params.side.profit / 100;
  const suggestedContractsRaw = riskPerContractDollars > 0 ? suggestedDollars / riskPerContractDollars : 0;
  const suggestedContracts = Math.max(0, Math.floor(suggestedContractsRaw));

  return {
    sizingModeLabel: sizingModeLabel(params.sizingMode),
    suggestedDollars: round(suggestedDollars, 4),
    suggestedContractsRaw: round(suggestedContractsRaw, 4),
    suggestedContracts,
    maxLossDollars: round(suggestedContracts * riskPerContractDollars, 4),
    maxWinDollars: round(suggestedContracts * profitPerContractDollars, 4),
  };
}

function entryTargets(fairProbability: number, feeCents: number): EntryTargets {
  const maxWorthPaying = 100 * fairProbability - feeCents;
  return {
    maxWorthPaying: clamp(maxWorthPaying, 0, 100),
    zeroEvPrice: clamp(maxWorthPaying, 0, 100),
    roi5Price: clamp(100 * fairProbability / 1.05 - feeCents, 0, 100),
    roi10Price: clamp(100 * fairProbability / 1.1 - feeCents, 0, 100),
    roi20Price: clamp(100 * fairProbability / 1.2 - feeCents, 0, 100),
  };
}

function buildScenarioRows(side: SideKey, feeMode: FeeMode, customFeeCents: number, fairYes: number, priceCents: number): ScenarioRow[] {
  const scenarioShifts = [
    { label: 'Fair -5%', fairYesShift: -0.05 },
    { label: 'Fair -2%', fairYesShift: -0.02 },
    { label: 'Current fair', fairYesShift: 0 },
    { label: 'Fair +2%', fairYesShift: 0.02 },
    { label: 'Fair +5%', fairYesShift: 0.05 },
  ];

  return scenarioShifts.map((scenario) => {
    const shiftedFairYes = clamp(fairYes + scenario.fairYesShift, 0, 1);
    const scenarioFair = getFairProbabilityForSide(side, shiftedFairYes);
    const scenarioFee = getFeePerContractCents({
      feeMode,
      customFeeCents,
      priceCents,
    });
    const netEv = computeNetEvCents(scenarioFair, priceCents, scenarioFee);

    return {
      label: scenario.label,
      fairProbability: scenarioFair,
      netEv: round(netEv, 4),
      edge: round(100 * scenarioFair - priceCents - scenarioFee, 4),
    };
  });
}

function buildSlippageRows(side: SideKey, fairProbability: number, feeMode: FeeMode, customFeeCents: number, basePriceCents: number): SlippageRow[] {
  const slippageSteps = [0, 1, 2, 3];

  return slippageSteps.map((step) => {
    const slippedPrice = clamp(basePriceCents + step, 0, 100);
    const slippedFee = getFeePerContractCents({
      feeMode,
      customFeeCents,
      priceCents: slippedPrice,
    });
    const netEv = computeNetEvCents(fairProbability, slippedPrice, slippedFee);
    const roiOnRisk = computeRoi(netEv, slippedPrice + slippedFee);

    return {
      label: step === 0 ? 'Current fill' : `+${step}¢ worse`,
      price: round(slippedPrice, 4),
      netEv: round(netEv, 4),
      roiOnRisk: round(roiOnRisk, 6),
    };
  });
}

function buildPricingReference(params: {
  bid: number | null;
  ask: number | null;
  fairProbability: number;
  feeMode: FeeMode;
  customFeeCents: number;
}): PricingReference {
  const base = getQuoteMetrics(params.bid, params.ask);

  if (base.ask === null) {
    return {
      ...base,
      bidReferenceEv: base.bid !== null
        ? round(
            computeNetEvCents(
              params.fairProbability,
              base.bid,
              getFeePerContractCents({ feeMode: params.feeMode, customFeeCents: params.customFeeCents, priceCents: base.bid }),
            ),
            4,
          )
        : null,
      midpointEv: base.midpoint !== null
        ? round(
            computeNetEvCents(
              params.fairProbability,
              base.midpoint,
              getFeePerContractCents({ feeMode: params.feeMode, customFeeCents: params.customFeeCents, priceCents: base.midpoint }),
            ),
            4,
          )
        : null,
    };
  }

  return {
    ...base,
    bidReferenceEv: base.bid !== null
      ? round(
          computeNetEvCents(
            params.fairProbability,
            base.bid,
            getFeePerContractCents({ feeMode: params.feeMode, customFeeCents: params.customFeeCents, priceCents: base.bid }),
          ),
          4,
        )
      : null,
    midpointEv: base.midpoint !== null
      ? round(
          computeNetEvCents(
            params.fairProbability,
            base.midpoint,
            getFeePerContractCents({ feeMode: params.feeMode, customFeeCents: params.customFeeCents, priceCents: base.midpoint }),
          ),
          4,
        )
      : null,
  };
}

function calculateSide(params: {
  side: SideKey;
  price: number | null;
  fairProbability: number;
  fairYes: number;
  feeMode: FeeMode;
  customFeeCents: number;
  kellyCapFraction: number;
  bankroll: number;
  sizingMode: SizingMode;
  fixedDollarSize: number;
  fixedMaxLoss: number;
  fixedBankrollRiskPercent: number;
  quoteBid: number | null;
  quoteAsk: number | null;
}): SideResult {
  const base = DEFAULT_SIDE_RESULT(params.side);

  if (params.price === null) {
    return base;
  }

  const feePerContract = getFeePerContractCents({
    feeMode: params.feeMode,
    customFeeCents: params.customFeeCents,
    priceCents: params.price,
  });

  const risk = params.price + feePerContract;
  const profit = 100 - params.price - feePerContract;
  const loss = risk;
  const grossEv = computeGrossEvCents(params.fairProbability, params.price);
  const netEv = computeNetEvCents(params.fairProbability, params.price, feePerContract);
  const breakEvenProbability = risk / 100;
  const grossEdge = 100 * params.fairProbability - params.price;
  const netEdge = 100 * params.fairProbability - risk;
  const roiOnRisk = computeRoi(netEv, risk);
  const fullKellyFraction = computeKelly(params.fairProbability, params.price, feePerContract);
  const cappedKellyFraction = Math.min(fullKellyFraction, params.kellyCapFraction);

  const result: SideResult = {
    side: params.side,
    label: params.side === 'yes' ? 'Buy YES' : 'Buy NO',
    isAvailable: true,
    price: params.price,
    fairProbability: params.fairProbability,
    fairProbabilityNeeded: breakEvenProbability,
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
    pricingReference: buildPricingReference({
      bid: params.quoteBid,
      ask: params.quoteAsk,
      fairProbability: params.fairProbability,
      feeMode: params.feeMode,
      customFeeCents: params.customFeeCents,
    }),
    entryTargets: entryTargets(params.fairProbability, feePerContract),
    scenarioRows: buildScenarioRows(params.side, params.feeMode, params.customFeeCents, params.fairYes, params.price),
    slippageRows: buildSlippageRows(params.side, params.fairProbability, params.feeMode, params.customFeeCents, params.price),
    position: DEFAULT_POSITION(),
    feePerContract,
  };

  result.position = buildPositionOutput({
    side: result,
    bankroll: params.bankroll,
    sizingMode: params.sizingMode,
    fixedDollarSize: params.fixedDollarSize,
    fixedMaxLoss: params.fixedMaxLoss,
    fixedBankrollRiskPercent: params.fixedBankrollRiskPercent,
  });

  return result;
}

function reverseCalculator(params: {
  fairYes: number;
  feeMode: FeeMode;
  customFeeCents: number;
  targetEvCents: number;
  targetRoiFraction: number;
}): ReverseCalculatorOutput {
  const zeroFee = params.feeMode === 'custom' || params.feeMode === 'no-fee';
  const yesFee = zeroFee ? getFeePerContractCents({ feeMode: params.feeMode, customFeeCents: params.customFeeCents, priceCents: 50 }) : getFeePerContractCents({ feeMode: params.feeMode, customFeeCents: params.customFeeCents, priceCents: 50 });
  const noFee = yesFee;
  const fairNo = 1 - params.fairYes;
  const roiBase = 1 + params.targetRoiFraction;

  return {
    targetEvCents: params.targetEvCents,
    targetRoiFraction: params.targetRoiFraction,
    yesMaxForEv: clamp(100 * params.fairYes - yesFee - params.targetEvCents, 0, 100),
    noMaxForEv: clamp(100 * fairNo - noFee - params.targetEvCents, 0, 100),
    yesMaxForRoi: clamp(100 * params.fairYes / roiBase - yesFee, 0, 100),
    noMaxForRoi: clamp(100 * fairNo / roiBase - noFee, 0, 100),
  };
}

export function calculate(inputs: Inputs): CalculatorState {
  const errors: string[] = [];

  const yesPriceInput = parseOptionalNumber(inputs.yesPrice);
  const noPriceInput = parseOptionalNumber(inputs.noPrice);
  const yesBid = parseOptionalNumber(inputs.yesBid);
  const yesAsk = parseOptionalNumber(inputs.yesAsk);
  const noBid = parseOptionalNumber(inputs.noBid);
  const noAsk = parseOptionalNumber(inputs.noAsk);
  const fairYes = parseOptionalNumber(inputs.fairYesProbability);
  const bankroll = parseOptionalNumber(inputs.bankroll);
  const fee = parseOptionalNumber(inputs.fee);
  const kellyCapPercent = parseOptionalNumber(inputs.kellyCapPercent);
  const fixedDollarSize = parseOptionalNumber(inputs.fixedDollarSize);
  const fixedMaxLoss = parseOptionalNumber(inputs.fixedMaxLoss);
  const fixedBankrollRiskPercent = parseOptionalNumber(inputs.fixedBankrollRiskPercent);
  const reverseDesiredEv = parseOptionalNumber(inputs.reverseDesiredEv);
  const reverseDesiredRoi = parseOptionalNumber(inputs.reverseDesiredRoi);

  const yesPrice = inputs.pricingMode === 'quote' ? yesAsk : yesPriceInput;
  const noPrice = inputs.pricingMode === 'quote' ? noAsk : noPriceInput;

  if (yesPrice === null && noPrice === null) {
    errors.push(inputs.pricingMode === 'quote' ? 'Enter at least one ask price in quote mode.' : 'Enter a YES price, a NO price, or both.');
  }

  for (const [label, value] of [
    ['YES buy price', yesPriceInput],
    ['NO buy price', noPriceInput],
    ['YES bid', yesBid],
    ['YES ask', yesAsk],
    ['NO bid', noBid],
    ['NO ask', noAsk],
  ] as const) {
    if (value !== null && (value < 0 || value > 100)) {
      errors.push(`${label} must be between 0 and 100 cents.`);
    }
  }

  if (yesBid !== null && yesAsk !== null && yesBid > yesAsk) {
    errors.push('YES bid cannot be above YES ask.');
  }

  if (noBid !== null && noAsk !== null && noBid > noAsk) {
    errors.push('NO bid cannot be above NO ask.');
  }

  if (fairYes === null || fairYes < 0 || fairYes > 100) {
    errors.push('Fair YES probability must be between 0 and 100%.');
  }

  if (bankroll === null || bankroll <= 0) {
    errors.push('Bankroll must be greater than 0.');
  }

  if (fee === null || fee < 0) {
    errors.push('Custom fee must be 0 or more cents.');
  }

  if (kellyCapPercent === null || kellyCapPercent < 0 || kellyCapPercent > 100) {
    errors.push('Kelly cap must be between 0 and 100%.');
  }

  if (inputs.sizingMode === 'fixed-dollar' && (fixedDollarSize === null || fixedDollarSize < 0)) {
    errors.push('Fixed dollar size must be 0 or more.');
  }

  if (inputs.sizingMode === 'fixed-max-loss' && (fixedMaxLoss === null || fixedMaxLoss < 0)) {
    errors.push('Fixed max loss must be 0 or more.');
  }

  if (inputs.sizingMode === 'fixed-bankroll-risk' && (fixedBankrollRiskPercent === null || fixedBankrollRiskPercent < 0 || fixedBankrollRiskPercent > 100)) {
    errors.push('Fixed bankroll risk must be between 0 and 100%.');
  }

  if (reverseDesiredEv !== null && reverseDesiredEv < 0) {
    errors.push('Target EV must be 0 or more cents.');
  }

  if (reverseDesiredRoi !== null && reverseDesiredRoi < 0) {
    errors.push('Target ROI must be 0% or more.');
  }

  if (
    errors.length > 0 ||
    fairYes === null ||
    bankroll === null ||
    fee === null ||
    kellyCapPercent === null
  ) {
    return {
      parsed: null,
      errors,
      yes: DEFAULT_SIDE_RESULT('yes'),
      no: DEFAULT_SIDE_RESULT('no'),
      bestSide: null,
      recommendation: 'pass',
      recommendationLabel: 'Pass',
      reverse: null,
    };
  }

  const fairYesFraction = fairYes / 100;
  const fairNoFraction = 1 - fairYesFraction;
  const kellyCapFraction = kellyCapPercent / 100;

  const yes = calculateSide({
    side: 'yes',
    price: yesPrice,
    fairProbability: fairYesFraction,
    fairYes: fairYesFraction,
    feeMode: inputs.feeMode,
    customFeeCents: fee,
    kellyCapFraction,
    bankroll,
    sizingMode: inputs.sizingMode,
    fixedDollarSize: fixedDollarSize ?? 0,
    fixedMaxLoss: fixedMaxLoss ?? 0,
    fixedBankrollRiskPercent: fixedBankrollRiskPercent ?? 0,
    quoteBid: yesBid,
    quoteAsk: yesAsk,
  });

  const no = calculateSide({
    side: 'no',
    price: noPrice,
    fairProbability: fairNoFraction,
    fairYes: fairYesFraction,
    feeMode: inputs.feeMode,
    customFeeCents: fee,
    kellyCapFraction,
    bankroll,
    sizingMode: inputs.sizingMode,
    fixedDollarSize: fixedDollarSize ?? 0,
    fixedMaxLoss: fixedMaxLoss ?? 0,
    fixedBankrollRiskPercent: fixedBankrollRiskPercent ?? 0,
    quoteBid: noBid,
    quoteAsk: noAsk,
  });

  const positiveCandidates = [yes, no].filter((side) => side.isAvailable && side.netEv > 0);
  const bestSide = positiveCandidates.length > 0 ? positiveCandidates.sort((a, b) => b.netEv - a.netEv)[0].side : null;

  let recommendation: 'buy-yes' | 'buy-no' | 'pass' = 'pass';
  let recommendationLabel = 'Pass';

  if (bestSide === 'yes') {
    recommendation = 'buy-yes';
    recommendationLabel = 'Buy YES';
  } else if (bestSide === 'no') {
    recommendation = 'buy-no';
    recommendationLabel = 'Buy NO';
  }

  const reverse = reverseCalculator({
    fairYes: fairYesFraction,
    feeMode: inputs.feeMode,
    customFeeCents: fee,
    targetEvCents: reverseDesiredEv ?? 0,
    targetRoiFraction: (reverseDesiredRoi ?? 10) / 100,
  });

  return {
    parsed: {
      fairYes: fairYesFraction,
      fairNo: fairNoFraction,
      bankroll,
      kellyCapFraction,
      feeMode: inputs.feeMode,
      sizingMode: inputs.sizingMode,
    },
    errors,
    yes,
    no,
    bestSide,
    recommendation,
    recommendationLabel,
    reverse,
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

export function formatSignedCents(value: number, precision: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}${Math.abs(value).toFixed(precision)}¢`;
}

export function formatSignedCurrencyFromCents(value: number, precision: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}$${(Math.abs(value) / 100).toFixed(precision)}`;
}


