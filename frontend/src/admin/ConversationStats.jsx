// Two side-by-side bar charts for the admin dashboard: current 7 days
// (including today) vs previous 7. Bars are hand-rolled SVG to avoid
// pulling in recharts for what amounts to two simple charts.
//
// Data comes from GET /api/admin/analytics — server-side aggregation in
// adminAnalytics handler. Renders skeleton on load, error on fail, both
// charts otherwise.

import { useEffect, useState } from "react";

function BarChart({ data, fill }) {
  const width = 100; // viewBox units; the wrapper scales with CSS
  const height = 50;
  const padTop = 4;
  const padBottom = 12;
  const padX = 4;
  const max = Math.max(1, ...data.map((d) => d.count));
  const barAreaH = height - padTop - padBottom;
  const slot = (width - padX * 2) / data.length;
  const gap = slot * 0.18;
  const barW = slot - gap;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="w-full h-44"
      role="img"
      aria-label="Daily conversation counts"
    >
      {/* horizontal gridlines */}
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <line
          key={f}
          x1={padX}
          x2={width - padX}
          y1={padTop + barAreaH * (1 - f)}
          y2={padTop + barAreaH * (1 - f)}
          stroke="rgb(55 65 81 / 0.6)"
          strokeWidth="0.2"
          strokeDasharray="0.6 0.6"
        />
      ))}
      {data.map((d, i) => {
        const h = (d.count / max) * barAreaH;
        const x = padX + slot * i + gap / 2;
        const y = padTop + barAreaH - h;
        return (
          <g key={d.date}>
            <rect
              x={x}
              y={y}
              width={barW}
              height={h}
              fill={fill}
              rx="0.6"
            >
              <title>{`${d.day} ${d.date}: ${d.count}`}</title>
            </rect>
            <text
              x={x + barW / 2}
              y={height - 2}
              textAnchor="middle"
              fontSize="3.5"
              fill="rgb(156 163 175)"
            >
              {d.day}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function Card({ title, total, badge, children }) {
  return (
    <div className="bg-gray-900 rounded-lg border border-gray-800 p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-red-300">{title}</h2>
        <div className="flex flex-wrap items-baseline gap-3">
          <span className="text-3xl font-bold text-gray-100">{total}</span>
          <span className="text-sm text-gray-400">conversations</span>
          {badge}
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function PercentBadge({ value }) {
  if (value === 0) return null;
  const positive = value > 0;
  return (
    <span
      className={`px-2 py-0.5 rounded text-xs font-semibold ${
        positive
          ? "bg-emerald-500/20 text-emerald-300"
          : "bg-red-500/20 text-red-300"
      }`}
    >
      {positive ? "+" : ""}
      {value}% vs previous
    </span>
  );
}

export default function ConversationStats() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/analytics", { credentials: "same-origin" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="bg-gray-900 rounded-lg border border-gray-800 px-5 py-3 text-sm text-gray-400">
        Couldn't load analytics: {error}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="bg-gray-900 rounded-lg border border-gray-800 p-5 h-64 animate-pulse"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card
        title="Last 7 Days"
        total={data.currentTotal}
        badge={<PercentBadge value={data.percentChange} />}
      >
        <BarChart data={data.current} fill="rgb(220 38 38)" />
      </Card>
      <Card
        title="Previous Week (7–14 days ago)"
        total={data.previousTotal}
      >
        <BarChart data={data.previous} fill="rgb(127 29 29)" />
      </Card>
    </div>
  );
}
