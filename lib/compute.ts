import {
  Kline,
  RiskLimitTier,
  LongShortRatio,
  InsuranceEntry,
  Ticker,
} from "./bybit";

export interface RiskBin {
  priceLow: number;
  priceHigh: number;
  priceMid: number;
  side: "long" | "short"; // which side would currently be in profit if it entered in this bin
  volumeShare: number; // 0..1, share of turnover observed in this bin (proxy for interest at this level)
  pnlPct: number; // unrealized PnL% if entered at bin mid, marked at current price
  leveragedReturn: number; // heuristic ranking factor: pnlPct * avgLeverage
  intensity: number; // 0..1 normalized risk-map color intensity
}

export interface FundStress {
  coin: string;
  balance: number | null;
  valueUsd: number | null;
  assumedTriggerPct: number;
  assumedStopPct: number;
  note: string;
}

export interface AdlMapResult {
  symbol: string;
  markPrice: number;
  fundingRate: number;
  openInterestValue: number;
  longShortRatio: LongShortRatio | null;
  bins: RiskBin[];
  fund: FundStress;
  assumptions: string[];
}

function buildVolumeProfile(klines: Kline[], bucketCount: number) {
  if (klines.length === 0) return { buckets: [], lo: 0, hi: 0 };
  let lo = Infinity;
  let hi = -Infinity;
  for (const k of klines) {
    lo = Math.min(lo, k.low);
    hi = Math.max(hi, k.high);
  }
  if (lo === hi) hi = lo * 1.001;
  const step = (hi - lo) / bucketCount;
  const turnoverByBucket = new Array(bucketCount).fill(0);

  for (const k of klines) {
    // Spread each candle's turnover evenly across the buckets its range touches.
    const startIdx = Math.max(0, Math.min(bucketCount - 1, Math.floor((k.low - lo) / step)));
    const endIdx = Math.max(0, Math.min(bucketCount - 1, Math.floor((k.high - lo) / step)));
    const span = endIdx - startIdx + 1;
    const share = k.turnover / span;
    for (let i = startIdx; i <= endIdx; i++) {
      turnoverByBucket[i] += share;
    }
  }

  const totalTurnover = turnoverByBucket.reduce((a, b) => a + b, 0) || 1;

  const buckets = turnoverByBucket.map((t, i) => ({
    priceLow: lo + i * step,
    priceHigh: lo + (i + 1) * step,
    volumeShare: t / totalTurnover,
  }));

  return { buckets, lo, hi };
}

export function computeAdlMap(params: {
  symbol: string;
  klines: Kline[];
  ticker: Ticker;
  riskTiers: RiskLimitTier[];
  longShortRatio: LongShortRatio | null;
  fund: InsuranceEntry | null;
  avgLeverage: number;
  bucketCount: number;
  assumedTriggerPct: number;
  assumedStopPct: number;
}): AdlMapResult {
  const {
    symbol,
    klines,
    ticker,
    longShortRatio,
    fund,
    avgLeverage,
    bucketCount,
    assumedTriggerPct,
    assumedStopPct,
  } = params;

  const mark = ticker.markPrice;
  const { buckets } = buildVolumeProfile(klines, bucketCount);

  const buyRatio = longShortRatio?.buyRatio ?? 0.5;
  const sellRatio = longShortRatio?.sellRatio ?? 0.5;

  const bins: RiskBin[] = buckets
    .filter((b) => b.volumeShare > 0)
    .map((b) => {
      const mid = (b.priceLow + b.priceHigh) / 2;
      const isBelowMark = mid < mark;
      // A position opened below the current mark price is under water if
      // short, in profit if long -- and vice versa above the mark price.
      const side: "long" | "short" = isBelowMark ? "long" : "short";
      const pnlPct =
        side === "long" ? (mark - mid) / mid : (mid - mark) / mid;

      const sideBias = side === "long" ? buyRatio : sellRatio;
      const leveragedReturn = Math.max(0, pnlPct) * avgLeverage;

      return {
        priceLow: b.priceLow,
        priceHigh: b.priceHigh,
        priceMid: mid,
        side,
        volumeShare: b.volumeShare,
        pnlPct,
        leveragedReturn,
        // Raw score before normalization: how much volume sits here, how
        // profitable it currently is, and how leaned the crowd is toward
        // the profiting side.
        intensity: b.volumeShare * leveragedReturn * sideBias,
      };
    });

  const maxIntensity = Math.max(...bins.map((b) => b.intensity), 1e-9);
  for (const b of bins) {
    b.intensity = b.intensity / maxIntensity;
  }

  const fundStress: FundStress = {
    coin: fund?.coin ?? "USDT",
    balance: fund?.balance ?? null,
    valueUsd: fund?.value ?? null,
    assumedTriggerPct,
    assumedStopPct,
    note:
      "Bybit не публикует исторический 8ч high-water mark и точные Trigger/Stop Line страхового фонда через открытый API — эти пороги показаны в интерфейсе биржи, но не в REST/WS. Значения ниже — это баланс фонда на текущий момент и предположение (по умолчанию 30%/25%, как в примере из справки Bybit), а не официальный live-триггер.",
  };

  return {
    symbol,
    markPrice: mark,
    fundingRate: ticker.fundingRate,
    openInterestValue: ticker.openInterestValue,
    longShortRatio,
    bins,
    fund: fundStress,
    assumptions: [
      "Ценовые бины строятся из объёма (turnover) последних свечей — это прокси для распределения точек входа, а не реальные данные по позициям.",
      "«Leveraged Return» = PnL% × выбранное среднее плечо. Реальная формула Bybit использует Position Margin Rate конкретного счёта — приватную величину, которую нельзя получить извне.",
      "Соотношение long/short берётся из Account Long/Short Ratio (по числу аккаунтов), а не по объёму открытых позиций.",
      "Insurance Fund показывает только текущий баланс. Trigger/Stop Line и 8-часовой high-water mark не раскрываются публичным API — используются предполагаемые значения.",
      "Карта показывает относительную зону риска ADL, а не персональный рейтинг — сравнение ранжирования возможно только внутри аккаунта конкретной биржи.",
    ],
  };
}
