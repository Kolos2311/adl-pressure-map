"use client";

import { useEffect, useMemo, useState } from "react";
import Heatmap from "@/components/Heatmap";
import { POPULAR_SYMBOLS, LOOKBACKS } from "@/lib/constants";
import type { AdlMapResult } from "@/lib/compute";

const POLL_MS = 15000;

export default function Page() {
  const [symbol, setSymbol] = useState<string>("BTCUSDT");
  const [leverage, setLeverage] = useState(25);
  const [lookback, setLookback] = useState("1d");
  const [triggerPct, setTriggerPct] = useState(30);
  const [stopPct, setStopPct] = useState(25);
  const [data, setData] = useState<AdlMapResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAssumptions, setShowAssumptions] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const params = new URLSearchParams({
          symbol,
          leverage: String(leverage),
          lookback,
          triggerPct: String(triggerPct),
          stopPct: String(stopPct),
        });
        const res = await fetch(`/api/adl-map?${params.toString()}`, { cache: "no-store" });
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(json.error ?? "Ошибка запроса");
          setData(null);
        } else {
          setError(null);
          setData(json);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Сеть недоступна");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    setLoading(true);
    load();
    const id = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [symbol, leverage, lookback, triggerPct, stopPct]);

  const fundDrawdownPct = useMemo(() => {
    // Without a real high-water mark we can only show balance, not a live
    // drawdown ratio. Kept as null and disclosed in the UI.
    return null as number | null;
  }, [data]);

  return (
    <main style={{ maxWidth: 1040, margin: "0 auto", padding: "32px 20px 80px" }}>
      <header style={{ marginBottom: 28 }}>
        <div
          className="mono"
          style={{
            fontSize: 12,
            letterSpacing: "0.12em",
            color: "var(--muted)",
            marginBottom: 6,
          }}
        >
          BYBIT · PERPETUAL FUTURES
        </div>
        <h1
          className="mono"
          style={{
            fontSize: 28,
            letterSpacing: "0.02em",
            margin: 0,
            fontWeight: 600,
          }}
        >
          ADL PRESSURE MAP
        </h1>
        <p style={{ color: "var(--muted)", maxWidth: 640, marginTop: 10, lineHeight: 1.6 }}>
          Эвристическая карта зон повышенного риска Auto-Deleveraging. Строится из публичных
          рыночных данных (объём, OI, funding, long/short ratio) — это{" "}
          <strong style={{ color: "var(--text)" }}>не</strong> персональный ADL-рейтинг и не
          официальные данные Bybit.
        </p>
      </header>

      <section
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 16,
          alignItems: "flex-end",
          background: "var(--panel)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          padding: "16px 18px",
          marginBottom: 20,
        }}
      >
        <Field label="Пара">
          <select
            className="mono"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            style={selectStyle}
          >
            {POPULAR_SYMBOLS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>

        <Field label={`Среднее плечо: ${leverage}x`}>
          <input
            type="range"
            min={2}
            max={100}
            step={1}
            value={leverage}
            onChange={(e) => setLeverage(Number(e.target.value))}
            style={{ width: 180 }}
          />
        </Field>

        <Field label="Окно объёма">
          <select
            className="mono"
            value={lookback}
            onChange={(e) => setLookback(e.target.value)}
            style={selectStyle}
          >
            {LOOKBACKS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label={`Trigger Line (предположение): ${triggerPct}%`}>
          <input
            type="range"
            min={5}
            max={60}
            step={1}
            value={triggerPct}
            onChange={(e) => setTriggerPct(Number(e.target.value))}
            style={{ width: 140 }}
          />
        </Field>

        <Field label={`Stop Line (предположение): ${stopPct}%`}>
          <input
            type="range"
            min={0}
            max={triggerPct - 1}
            step={1}
            value={Math.min(stopPct, triggerPct - 1)}
            onChange={(e) => setStopPct(Number(e.target.value))}
            style={{ width: 140 }}
          />
        </Field>
      </section>

      {error && (
        <div
          className="mono"
          style={{
            background: "var(--short-dim)",
            border: "1px solid var(--short)",
            color: "var(--text)",
            borderRadius: 8,
            padding: "12px 16px",
            marginBottom: 20,
            fontSize: 13,
          }}
        >
          Ошибка загрузки данных: {error}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 20 }}>
        <div
          style={{
            background: "var(--panel)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            padding: "18px 20px",
            minHeight: 600,
          }}
        >
          {loading && !data ? (
            <div className="mono" style={{ color: "var(--muted)", padding: "48px 0", textAlign: "center" }}>
              Загрузка рыночных данных…
            </div>
          ) : data ? (
            <Heatmap bins={data.bins} markPrice={data.markPrice} symbol={data.symbol} />
          ) : null}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Panel title="Рынок">
            {data ? (
              <div className="mono" style={{ fontSize: 13, lineHeight: 2 }}>
                <Row label="Mark price" value={fmt(data.markPrice)} />
                <Row label="Funding" value={`${(data.fundingRate * 100).toFixed(4)}%`} />
                <Row label="OI value" value={fmtUsd(data.openInterestValue)} />
                <Row
                  label="Long/Short"
                  value={
                    data.longShortRatio
                      ? `${(data.longShortRatio.buyRatio * 100).toFixed(0)} / ${(data.longShortRatio.sellRatio * 100).toFixed(0)}`
                      : "н/д"
                  }
                />
              </div>
            ) : (
              <span style={{ color: "var(--muted)" }}>—</span>
            )}
          </Panel>

          <Panel title="Страховой фонд">
            {data ? (
              <div className="mono" style={{ fontSize: 13, lineHeight: 2 }}>
                <Row label="Coin" value={data.fund.coin} />
                <Row
                  label="Balance"
                  value={data.fund.balance != null ? data.fund.balance.toLocaleString() : "н/д"}
                />
                <Row
                  label="Value"
                  value={data.fund.valueUsd != null ? fmtUsd(data.fund.valueUsd) : "н/д"}
                />
                <div
                  style={{
                    marginTop: 10,
                    fontSize: 11,
                    color: "var(--muted)",
                    lineHeight: 1.6,
                    fontFamily: "var(--sans)",
                  }}
                >
                  {data.fund.note}
                </div>
              </div>
            ) : (
              <span style={{ color: "var(--muted)" }}>—</span>
            )}
          </Panel>

          <Panel title="Легенда">
            <div style={{ fontSize: 12, lineHeight: 1.8, color: "var(--muted)" }}>
              <LegendRow color="var(--long)" text="Long в прибыли на этом уровне" />
              <LegendRow color="var(--short)" text="Short в прибыли на этом уровне" />
              <LegendRow color="var(--heat-4)" text="Высокая интенсивность (>75%)" />
              <div style={{ marginTop: 8 }}>
                Длина полосы = относительная интенсивность риска на уровне. Пунктир — mark price.
              </div>
            </div>
          </Panel>

          <button
            className="mono"
            onClick={() => setShowAssumptions((v) => !v)}
            style={{
              background: "var(--panel-2)",
              border: "1px solid var(--border)",
              color: "var(--text)",
              borderRadius: 8,
              padding: "10px 14px",
              fontSize: 12,
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            {showAssumptions ? "▾" : "▸"} Что эта карта не знает
          </button>
          {showAssumptions && data && (
            <div
              style={{
                background: "var(--panel)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: "14px 16px",
                fontSize: 12,
                color: "var(--muted)",
                lineHeight: 1.7,
              }}
            >
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {data.assumptions.map((a, i) => (
                  <li key={i} style={{ marginBottom: 8 }}>
                    {a}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <footer
        className="mono"
        style={{ marginTop: 40, fontSize: 11, color: "var(--muted-2)", lineHeight: 1.7 }}
      >
        Данные: публичный REST API Bybit (v5/market). Обновление каждые {POLL_MS / 1000}с.
        Инструмент для образовательных целей, не финансовая рекомендация.
      </footer>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 11, color: "var(--muted)" }}>
      <span className="mono" style={{ letterSpacing: "0.03em" }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "var(--panel)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: "14px 16px",
      }}
    >
      <div
        className="mono"
        style={{ fontSize: 11, letterSpacing: "0.08em", color: "var(--muted)", marginBottom: 8 }}
      >
        {title.toUpperCase()}
      </div>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
      <span style={{ color: "var(--muted)" }}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function LegendRow({ color, text }: { color: string; text: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
      <span style={{ width: 10, height: 10, borderRadius: 2, background: color, display: "inline-block" }} />
      <span>{text}</span>
    </div>
  );
}

function fmt(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function fmtUsd(n: number) {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

const selectStyle: React.CSSProperties = {
  background: "var(--panel-2)",
  border: "1px solid var(--border)",
  color: "var(--text)",
  borderRadius: 6,
  padding: "8px 10px",
  fontSize: 13,
};
