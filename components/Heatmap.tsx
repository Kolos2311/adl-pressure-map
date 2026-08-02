"use client";

import { useMemo, useState } from "react";
import type { RiskBin } from "@/lib/compute";

interface Props {
  bins: RiskBin[];
  markPrice: number;
  symbol: string;
}

const HEIGHT = 560;
const WIDTH = 760;
const GUTTER = 96; // reserved for price labels on the left
const CENTER = GUTTER + (WIDTH - GUTTER) / 2;
const MAX_BAR = (WIDTH - GUTTER) / 2 - 24;

export default function Heatmap({ bins, markPrice, symbol }: Props) {
  const [hovered, setHovered] = useState<RiskBin | null>(null);

  const { sorted, priceLo, priceHi } = useMemo(() => {
    const s = [...bins].sort((a, b) => b.priceMid - a.priceMid);
    const lo = Math.min(...bins.map((b) => b.priceLow), markPrice);
    const hi = Math.max(...bins.map((b) => b.priceHigh), markPrice);
    return { sorted: s, priceLo: lo, priceHi: hi };
  }, [bins, markPrice]);

  if (bins.length === 0) {
    return (
      <div style={{ color: "var(--muted)", padding: "48px 0", textAlign: "center" }}>
        Недостаточно данных для построения карты.
      </div>
    );
  }

  const yFor = (price: number) => {
    const t = (price - priceLo) / (priceHi - priceLo || 1);
    return HEIGHT - t * HEIGHT;
  };

  const markY = yFor(markPrice);

  const heatColor = (intensity: number, side: "long" | "short") => {
    const base = side === "long" ? [79, 174, 140] : [194, 105, 79];
    const hot = [232, 92, 59]; // heat-4
    const mix = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);
    const t = Math.min(1, intensity * 1.15);
    const hotT = Math.max(0, intensity - 0.7) / 0.3; // only blend to hot above 0.7
    const r = mix(base[0], hot[0], hotT);
    const g = mix(base[1], hot[1], hotT);
    const b = mix(base[2], hot[2], hotT);
    return `rgba(${r}, ${g}, ${b}, ${0.22 + 0.68 * t})`;
  };

  const barHeight = Math.max(1.4, HEIGHT / bins.length - 0.6);

  return (
    <div style={{ position: "relative" }}>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        width="100%"
        height={HEIGHT}
        role="img"
        aria-label={`Карта риска ADL для ${symbol}`}
      >
        {/* center axis */}
        <line x1={CENTER} y1={0} x2={CENTER} y2={HEIGHT} stroke="var(--border)" strokeWidth={1} />

        {/* side labels */}
        <text x={CENTER - MAX_BAR / 2} y={16} fill="var(--short)" fontSize={11} fontFamily="var(--mono)" textAnchor="middle" opacity={0.8}>
          SHORT В ПРИБЫЛИ
        </text>
        <text x={CENTER + MAX_BAR / 2} y={16} fill="var(--long)" fontSize={11} fontFamily="var(--mono)" textAnchor="middle" opacity={0.8}>
          LONG В ПРИБЫЛИ
        </text>

        {sorted.map((b, i) => {
          const y = yFor(b.priceMid);
          const w = Math.max(1, b.intensity * MAX_BAR);
          const x = b.side === "long" ? CENTER : CENTER - w;
          const color = heatColor(b.intensity, b.side);
          const isHot = b.intensity > 0.75;
          return (
            <rect
              key={i}
              x={x}
              y={y - barHeight / 2}
              width={w}
              height={barHeight}
              fill={color}
              stroke={isHot ? "var(--heat-4)" : "none"}
              strokeWidth={isHot ? 0.6 : 0}
              onMouseEnter={() => setHovered(b)}
              onMouseLeave={() => setHovered((h) => (h === b ? null : h))}
            />
          );
        })}

        {/* mark price line */}
        <line
          x1={0}
          y1={markY}
          x2={WIDTH}
          y2={markY}
          stroke="var(--heat-3)"
          strokeWidth={1.2}
          strokeDasharray="4 3"
        />
        <text x={WIDTH - 6} y={markY - 6} fill="var(--heat-3)" fontSize={11} fontFamily="var(--mono)" textAnchor="end">
          MARK {markPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
        </text>

        {/* price axis labels */}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const price = priceLo + t * (priceHi - priceLo);
          const y = HEIGHT - t * HEIGHT;
          return (
            <text key={t} x={4} y={y + 4} fill="var(--muted)" fontSize={10} fontFamily="var(--mono)">
              {price.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </text>
          );
        })}
      </svg>

      {hovered && (
        <div
          className="mono"
          style={{
            position: "absolute",
            right: 8,
            bottom: 8,
            background: "var(--panel-2)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: "10px 12px",
            fontSize: 12,
            lineHeight: 1.6,
            color: "var(--text)",
            minWidth: 200,
          }}
        >
          <div style={{ color: hovered.side === "long" ? "var(--long)" : "var(--short)" }}>
            {hovered.side === "long" ? "LONG" : "SHORT"} · вход ≈{" "}
            {hovered.priceMid.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </div>
          <div>PnL%: {(hovered.pnlPct * 100).toFixed(2)}%</div>
          <div>Leveraged return (эвристика): {hovered.leveragedReturn.toFixed(3)}</div>
          <div>Интенсивность: {(hovered.intensity * 100).toFixed(0)}%</div>
          <div>Доля объёма: {(hovered.volumeShare * 100).toFixed(2)}%</div>
        </div>
      )}
    </div>
  );
}
