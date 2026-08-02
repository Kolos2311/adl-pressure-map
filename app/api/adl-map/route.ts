import { NextRequest, NextResponse } from "next/server";
import {
  getKlines,
  getTicker,
  getRiskLimitTiers,
  getLongShortRatio,
  getInsuranceFund,
} from "@/lib/bybit";
import { computeAdlMap } from "@/lib/compute";

export const revalidate = 15;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") || "BTCUSDT").toUpperCase();
  const avgLeverage = Number(searchParams.get("leverage") || "25");
  const lookback = searchParams.get("lookback") || "1d"; // '4h' | '1d' | '3d' | '7d'
  const assumedTriggerPct = Number(searchParams.get("triggerPct") || "30");
  const assumedStopPct = Number(searchParams.get("stopPct") || "25");

  const lookbackMap: Record<string, { interval: string; limit: number }> = {
    "4h": { interval: "5", limit: 48 },
    "1d": { interval: "15", limit: 96 },
    "3d": { interval: "60", limit: 72 },
    "7d": { interval: "240", limit: 42 },
  };
  const { interval, limit } = lookbackMap[lookback] ?? lookbackMap["1d"];

  try {
    const [klines, ticker, riskTiers, longShortRatio] = await Promise.all([
      getKlines(symbol, interval, limit),
      getTicker(symbol),
      getRiskLimitTiers(symbol),
      getLongShortRatio(symbol),
    ]);

    // Insurance fund is tracked per settlement coin, not per symbol.
    const quoteCoin = symbol.endsWith("USDT") ? "USDT" : symbol.endsWith("USDC") ? "USDC" : "USDT";
    const fund = await getInsuranceFund(quoteCoin);

    const result = computeAdlMap({
      symbol,
      klines,
      ticker,
      riskTiers,
      longShortRatio,
      fund,
      avgLeverage,
      bucketCount: 60,
      assumedTriggerPct,
      assumedStopPct,
    });

    return NextResponse.json(result, {
      headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=30" },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Unknown error fetching Bybit data" },
      { status: 502 }
    );
  }
}
