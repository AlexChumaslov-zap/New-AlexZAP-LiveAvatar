// Two side-by-side bar charts for the admin dashboard: current 7 days
// (including today) vs previous 7. Ported from AlexZAP's
// components/ConversationStats.tsx — same recharts BarChart layout, same
// "Last 7 Days" / "Previous Week (7-14 days ago)" titles, same bar colors
// (#b91c1c current / #7f1d1d previous), same percent-change badge.
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

function Card({ children }) {
  return (
    <div className="bg-white rounded-xl shadow-md overflow-hidden">
      {children}
    </div>
  );
}

function CardHeader({ children }) {
  return <div className="px-6 pt-5 pb-3 flex flex-col items-start">{children}</div>;
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
            className="bg-white rounded-xl shadow-md h-80 animate-pulse"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Last 7 days conversations */}
      <Card>
        <CardHeader>
          <h2 className="text-xl font-bold text-red-900">Last 7 Days</h2>
          <div className="flex items-center mt-2">
            <span className="text-2xl font-bold text-gray-900">
              {data.currentTotal}
            </span>
            <span className="text-sm ml-2 text-gray-700">conversations</span>
            {data.percentChange !== 0 && (
              <span
                className={`ml-4 text-sm px-2 py-1 rounded ${
                  data.percentChange > 0
                    ? "bg-green-100 text-green-800"
                    : "bg-red-100 text-red-800"
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
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="day" />
              <YAxis allowDecimals={false} />
              <Tooltip
                formatter={(value) => [`${value} conversations`, "Count"]}
                labelFormatter={(label) => `${label}`}
              />
              <Bar dataKey="count" fill="#b91c1c" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardBody>
      </Card>

      {/* 7-14 days ago conversations */}
      <Card>
        <CardHeader>
          <h2 className="text-xl font-bold text-red-900">
            Previous Week (7-14 days ago)
          </h2>
          <div className="flex items-center mt-2">
            <span className="text-2xl font-bold text-gray-900">
              {data.previousTotal}
            </span>
            <span className="text-sm ml-2 text-gray-700">conversations</span>
          </div>
        </CardHeader>
        <CardBody>
          <ResponsiveContainer height={250} width="100%">
            <BarChart
              data={data.previous}
              margin={{ top: 10, right: 10, left: 10, bottom: 20 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="day" />
              <YAxis allowDecimals={false} />
              <Tooltip
                formatter={(value) => [`${value} conversations`, "Count"]}
                labelFormatter={(label) => `${label}`}
              />
              <Bar dataKey="count" fill="#7f1d1d" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardBody>
      </Card>
    </div>
  );
}
