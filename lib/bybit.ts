// Thin client around Bybit's public V5 REST API.
// Every call here runs server-side (inside the /api/adl-map route), so there
// is no browser CORS concern and responses can be cached at the edge.

const BASE = "https://api.bybit.com";

async function get<T>(path: string, params: Record<string, string>): Promise<T> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${BASE}${path}?${qs}`, {
    // Bybit market data changes fast; keep a short server-side cache so a
    // burst of visitors doesn't hammer the upstream API.
    next: { revalidate: 15 },
  });
  if (!res.ok) {
    throw new Error(`Bybit ${path} responded ${res.status}`);
  }
  const json = await res.json();
  if (json.retCode !== 0) {
    throw new Error(`Bybit ${path} retMsg: ${json.retMsg}`);
  }
  return json.result as T;
}

export interface Kline {
  start: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  turnover: number;
}

export async function getKlines(symbol: string, interval: string, limit: number): Promise<Kline[]> {
  const result = await get<{ list: string[][] }>("/v5/market/kline", {
    category: "linear",
    symbol,
    interval,
    limit: String(limit),
  });
  return result.list
    .map((row) => ({
      start: Number(row[0]),
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
      volume: Number(row[5]),
      turnover: Number(row[6]),
    }))
    .sort((a, b) => a.start - b.start);
}

export interface Ticker {
  symbol: string;
  lastPrice: number;
  markPrice: number;
  indexPrice: number;
  fundingRate: number;
  openInterest: number;
  openInterestValue: number;
  turnover24h: number;
  volume24h: number;
}

export async function getTicker(symbol: string): Promise<Ticker> {
  const result = await get<{ list: any[] }>("/v5/market/tickers", {
    category: "linear",
    symbol,
  });
  const t = result.list[0];
  return {
    symbol: t.symbol,
    lastPrice: Number(t.lastPrice),
    markPrice: Number(t.markPrice),
    indexPrice: Number(t.indexPrice),
    fundingRate: Number(t.fundingRate),
    openInterest: Number(t.openInterest),
    openInterestValue: Number(t.openInterestValue),
    turnover24h: Number(t.turnover24h),
    volume24h: Number(t.volume24h),
  };
}

export interface RiskLimitTier {
  id: number;
  riskLimitValue: number; // max position value (USDT) for this tier
  maintenanceMargin: number; // MMR as a fraction, e.g. 0.005
  initialMargin: number; // IMR as a fraction
  maxLeverage: number;
}

export async function getRiskLimitTiers(symbol: string): Promise<RiskLimitTier[]> {
  const result = await get<{ list: any[] }>("/v5/market/risk-limit", {
    category: "linear",
    symbol,
  });
  return result.list
    .map((r) => ({
      id: Number(r.id),
      riskLimitValue: Number(r.riskLimitValue),
      maintenanceMargin: Number(r.maintenanceMargin),
      initialMargin: Number(r.initialMargin),
      maxLeverage: Number(r.maxLeverage),
    }))
    .sort((a, b) => a.riskLimitValue - b.riskLimitValue);
}

export interface LongShortRatio {
  timestamp: number;
  buyRatio: number;
  sellRatio: number;
}

export async function getLongShortRatio(symbol: string): Promise<LongShortRatio | null> {
  try {
    const result = await get<{ list: any[] }>("/v5/market/account-ratio", {
      category: "linear",
      symbol,
      period: "1h",
      limit: "1",
    });
    const r = result.list[0];
    if (!r) return null;
    return {
      timestamp: Number(r.timestamp),
      buyRatio: Number(r.buyRatio),
      sellRatio: Number(r.sellRatio),
    };
  } catch {
    // Not all symbols expose this endpoint; treat as "unknown" rather than failing the whole map.
    return null;
  }
}

export interface OpenInterestPoint {
  timestamp: number;
  openInterest: number;
}

export async function getOpenInterestHistory(symbol: string): Promise<OpenInterestPoint[]> {
  const result = await get<{ list: any[] }>("/v5/market/open-interest", {
    category: "linear",
    symbol,
    intervalTime: "1h",
    limit: "48",
  });
  return result.list
    .map((r) => ({ timestamp: Number(r.timestamp), openInterest: Number(r.openInterest) }))
    .sort((a, b) => a.timestamp - b.timestamp);
}

export interface InsuranceEntry {
  coin: string;
  balance: number;
  value: number;
}

export async function getInsuranceFund(coin: string): Promise<InsuranceEntry | null> {
  try {
    const result = await get<{ updatedTime: string; list: any[] }>("/v5/market/insurance", {
      coin,
    });
    const r = result.list.find((x) => x.coin === coin);
    if (!r) return null;
    return { coin: r.coin, balance: Number(r.balance), value: Number(r.value) };
  } catch {
    return null;
  }
}


