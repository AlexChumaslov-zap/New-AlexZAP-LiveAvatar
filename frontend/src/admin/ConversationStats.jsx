// Two side-by-side bar charts for the admin dashboard: current 7 days
// (including today) vs previous 7. Layout, copy, and bar colors are ported
// from AlexZAP's components/ConversationStats.tsx; card chrome is dark to
// match the rest of the admin dashboard rather than AlexZAP's HeroUI light
// default.
//
// Data comes from GET /api/admin/analytics — server-side aggregation in
// the adminAnalytics Lambda, which fixes AlexZAP's off-by-one (today's
// conversations are now included in the current window).

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// Recharts axis/grid/tooltip palette tuned for the dark dashboard.
const AXIS_TICK = { fill: "rgb(156 163 175)", fontSize: 12 };
const AXIS_LINE = { stroke: "rgb(55 65 81)" };
const GRID_STROKE = "rgb(55 65 81)";
const TOOLTIP_STYLE = {
  background: "rgb(17 24 39)",
  border: "1px solid rgb(55 65 81)",
  borderRadius: 6,
  color: "rgb(243 244 246)",
  fontSize: 12,
};
const TOOLTIP_ITEM_STYLE = { color: "rgb(243 244 246)" };
const TOOLTIP_LABEL_STYLE = { color: "rgb(156 163 175)", marginBottom: 2 };
const TOOLTIP_CURSOR = { fill: "rgba(220, 38, 38, 0.08)" };

function Card({ children }) {
  return (
    <div className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden">
      {children}
    </div>
  );
}

function CardHeader({ children }) {
  return (
    <div className="px-6 pt-5 pb-3 flex flex-col items-start">{children}</div>
  );
}

function CardBody({ children }) {
  return <div className="px-3 pb-5">{children}</div>;
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="bg-gray-900 rounded-lg border border-gray-800 h-80 animate-pulse"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Last 7 days */}
      <Card>
        <CardHeader>
          <h2 className="text-xl font-bold text-red-300">Last 7 Days</h2>
          <div className="flex items-center mt-2">
            <span className="text-2xl font-bold text-gray-100">
              {data.currentTotal}
            </span>
            <span className="text-sm ml-2 text-gray-400">conversations</span>
            {data.percentChange !== 0 && (
              <span
                className={`ml-4 text-xs px-2 py-1 rounded font-semibold ${
                  data.percentChange > 0
                    ? "bg-emerald-500/20 text-emerald-300"
                    : "bg-red-500/20 text-red-300"
                }`}
              >
                {data.percentChange > 0 ? "+" : ""}
                {data.percentChange}% vs previous
              </span>
            )}
          </div>
        </CardHeader>
        <CardBody>
          <ResponsiveContainer height={250} width="100%">
            <BarChart
              data={data.current}
              margin={{ top: 10, right: 10, left: 10, bottom: 20 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke={GRID_STROKE}
              />
              <XAxis dataKey="day" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={AXIS_LINE} />
              <YAxis allowDecimals={false} tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={AXIS_LINE} />
              <Tooltip
                cursor={TOOLTIP_CURSOR}
                contentStyle={TOOLTIP_STYLE}
                itemStyle={TOOLTIP_ITEM_STYLE}
                labelStyle={TOOLTIP_LABEL_STYLE}
                formatter={(value) => [`${value} conversations`, "Count"]}
                labelFormatter={(label) => `${label}`}
              />
              <Bar dataKey="count" fill="#dc2626" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardBody>
      </Card>

      {/* 7-14 days ago */}
      <Card>
        <CardHeader>
          <h2 className="text-xl font-bold text-red-300">
            Previous Week (7-14 days ago)
          </h2>
          <div className="flex items-center mt-2">
            <span className="text-2xl font-bold text-gray-100">
              {data.previousTotal}
            </span>
            <span className="text-sm ml-2 text-gray-400">conversations</span>
          </div>
        </CardHeader>
        <CardBody>
          <ResponsiveContainer height={250} width="100%">
            <BarChart
              data={data.previous}
              margin={{ top: 10, right: 10, left: 10, bottom: 20 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke={GRID_STROKE}
              />
              <XAxis dataKey="day" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={AXIS_LINE} />
              <YAxis allowDecimals={false} tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={AXIS_LINE} />
              <Tooltip
                cursor={TOOLTIP_CURSOR}
                contentStyle={TOOLTIP_STYLE}
                itemStyle={TOOLTIP_ITEM_STYLE}
                labelStyle={TOOLTIP_LABEL_STYLE}
                formatter={(value) => [`${value} conversations`, "Count"]}
                labelFormatter={(label) => `${label}`}
              />
              <Bar dataKey="count" fill="#991b1b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardBody>
      </Card>
    </div>
  );
}
