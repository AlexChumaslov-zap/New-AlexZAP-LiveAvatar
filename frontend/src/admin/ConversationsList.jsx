// Admin conversations list — dark theme matching AlexZAP's HeroUI dark
// chrome. Sortable, filterable, paginated, with row-checkbox bulk actions
// (Phase D). URL search params hold sort/filter/page so links are shareable.

import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import ConversationStats from "./ConversationStats.jsx";

const PAGE_SIZE = 10;

const SORT_LABELS = {
  startTime: "Started",
  totalMessages: "Messages",
  status: "Status",
};

// Build a pagination model like [1, "…", 4, 5, 6, "…", 64]. Always shows the
// first and last page, plus a sibling window around the current page.
function getPageItems(current, total) {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const items = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) items.push("…");
  for (let i = start; i <= end; i++) items.push(i);
  if (end < total - 1) items.push("…");
  items.push(total);
  return items;
}

const STATUS_OPTIONS = ["active", "ended", "exported"];

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STATUS_CHIP = {
  active: "bg-emerald-500/20 text-emerald-300",
  ended: "bg-amber-500/20 text-amber-200",
  exported: "bg-sky-500/20 text-sky-200",
};

function StatusBadge({ status }) {
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
        STATUS_CHIP[status] || "bg-gray-700 text-gray-300"
      }`}
    >
      {status}
    </span>
  );
}

function SortHeader({ field, label, sort, order, onSort }) {
  const isActive = sort === field;
  const arrow = isActive ? (order === "asc" ? "↑" : "↓") : "";
  return (
    <th
      onClick={() => onSort(field)}
      className="px-3 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wide cursor-pointer select-none hover:text-gray-100"
    >
      {label} <span className="text-gray-500">{arrow}</span>
    </th>
  );
}

export default function ConversationsList() {
  const [searchParams, setSearchParams] = useSearchParams();

  const sort = searchParams.get("sort") || "startTime";
  const order = searchParams.get("order") || "desc";
  const search = searchParams.get("search") || "";
  const statusCsv = searchParams.get("status") || "";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));

  const [searchInput, setSearchInput] = useState(search);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Bulk-action state — selected conversation ids on the current page.
  const [selected, setSelected] = useState(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Debounce search input → URL update.
  useEffect(() => {
    const t = setTimeout(() => {
      if (searchInput !== search) {
        updateParams({ search: searchInput, page: "1" });
      }
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  // Fetch when params change.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSelected(new Set()); // wipe selection across page changes
    const params = new URLSearchParams();
    if (sort) params.set("sort", sort);
    if (order) params.set("order", order);
    if (search) params.set("search", search);
    if (statusCsv) params.set("status", statusCsv);
    params.set("page", String(page));
    params.set("pageSize", String(PAGE_SIZE));
    fetch(`/api/admin/conversations?${params.toString()}`, {
      credentials: "same-origin",
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sort, order, search, statusCsv, page, reloadKey]);

  function updateParams(updates) {
    const next = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(updates)) {
      if (v === "" || v == null) next.delete(k);
      else next.set(k, v);
    }
    setSearchParams(next, { replace: false });
  }

  function onSortClick(field) {
    if (sort === field) {
      updateParams({ order: order === "asc" ? "desc" : "asc" });
    } else {
      updateParams({ sort: field, order: "desc" });
    }
  }

  function toggleStatus(status) {
    const cur = statusCsv ? statusCsv.split(",") : [];
    const next = cur.includes(status)
      ? cur.filter((s) => s !== status)
      : [...cur, status];
    updateParams({ status: next.join(","), page: "1" });
  }

  function toggleRow(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (!data) return;
    setSelected((prev) => {
      const allIds = data.conversations.map((c) => c.id);
      const allSelected = allIds.every((id) => prev.has(id));
      if (allSelected) return new Set();
      return new Set(allIds);
    });
  }

  async function bulkEnd() {
    if (selected.size === 0 || bulkBusy) return;
    if (!confirm(`End ${selected.size} conversation(s)?`)) return;
    setBulkBusy(true);
    try {
      const r = await fetch("/api/admin/conversations/bulk-end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ ids: Array.from(selected) }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setSelected(new Set());
      setReloadKey((k) => k + 1);
    } catch (e) {
      alert(`Bulk end failed: ${e.message || e}`);
    } finally {
      setBulkBusy(false);
    }
  }

  function exportCsv() {
    if (!data || data.conversations.length === 0) return;
    const rowsToExport = selected.size > 0
      ? data.conversations.filter((c) => selected.has(c.id))
      : data.conversations;
    const header = [
      "id",
      "startTime",
      "endTime",
      "status",
      "totalMessages",
      "durationMs",
      "visitorName",
      "visitorEmail",
      "visitorCompany",
    ];
    const escape = (v) => {
      if (v == null) return "";
      const s = String(v).replace(/"/g, '""');
      return /[",\n]/.test(s) ? `"${s}"` : s;
    };
    const lines = [header.join(",")];
    for (const c of rowsToExport) {
      lines.push(
        [
          c.id,
          c.startTime,
          c.endTime,
          c.status,
          c.totalMessages,
          c.durationMs,
          c.visitor?.name,
          c.visitor?.email,
          c.visitor?.company,
        ]
          .map(escape)
          .join(","),
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `conversations-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const activeStatuses = statusCsv ? statusCsv.split(",") : [];
  const allChecked = useMemo(() => {
    if (!data || data.conversations.length === 0) return false;
    return data.conversations.every((c) => selected.has(c.id));
  }, [data, selected]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-red-300">Conversations</h1>
        {data && (
          <span className="text-sm text-gray-400">
            {data.total.toLocaleString()} total
          </span>
        )}
        <div className="flex-1" />
        <input
          type="search"
          placeholder="Search name / email / company…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="px-3 py-1.5 bg-gray-900 border border-gray-700 text-gray-100 placeholder-gray-500 rounded-md text-sm w-64 focus:outline-none focus:ring-2 focus:ring-red-500"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-gray-400 uppercase">
          Status:
        </span>
        {STATUS_OPTIONS.map((s) => {
          const active = activeStatuses.includes(s);
          return (
            <button
              key={s}
              onClick={() => toggleStatus(s)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                active
                  ? "bg-gradient-to-tr from-red-600 to-red-950 text-white border-red-700"
                  : "bg-gray-900 text-gray-300 border-gray-700 hover:border-gray-500"
              }`}
            >
              {s}
            </button>
          );
        })}
        {activeStatuses.length > 0 && (
          <button
            onClick={() => updateParams({ status: "", page: "1" })}
            className="text-xs text-gray-400 hover:text-gray-100 ml-1"
          >
            clear
          </button>
        )}
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 flex items-center gap-3 text-sm">
          <span className="text-gray-300">
            {selected.size} selected
          </span>
          <button
            onClick={() => setSelected(new Set())}
            className="text-xs text-gray-400 hover:text-gray-100"
          >
            clear selection
          </button>
          <div className="flex-1" />
          <button
            onClick={exportCsv}
            className="px-3 py-1.5 rounded-md bg-gray-800 hover:bg-gray-700 text-gray-100 text-xs font-medium border border-gray-700 transition-colors"
          >
            Export CSV
          </button>
          <button
            onClick={bulkEnd}
            disabled={bulkBusy}
            className="px-3 py-1.5 rounded-md bg-gradient-to-tr from-red-600 to-red-950 hover:shadow-lg disabled:opacity-50 text-white text-xs font-semibold transition-all"
          >
            {bulkBusy ? "Ending…" : "End selected"}
          </button>
        </div>
      )}

      <div className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-800">
            <thead className="bg-gray-950">
              <tr>
                <th className="px-3 py-2 w-10">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={toggleAll}
                    className="rounded border-gray-600 bg-gray-800 text-red-600 focus:ring-red-500"
                  />
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">
                  Visitor
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">
                  Company
                </th>
                <SortHeader
                  field="startTime"
                  label={SORT_LABELS.startTime}
                  sort={sort}
                  order={order}
                  onSort={onSortClick}
                />
                <SortHeader
                  field="totalMessages"
                  label={SORT_LABELS.totalMessages}
                  sort={sort}
                  order={order}
                  onSort={onSortClick}
                />
                <SortHeader
                  field="status"
                  label={SORT_LABELS.status}
                  sort={sort}
                  order={order}
                  onSort={onSortClick}
                />
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-400 uppercase tracking-wide">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {loading && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-sm text-gray-400">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && error && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-sm text-red-300">
                    Couldn't load conversations: {error}
                  </td>
                </tr>
              )}
              {!loading && !error && data && data.conversations.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-sm text-gray-400">
                    No conversations match these filters.
                  </td>
                </tr>
              )}
              {!loading &&
                !error &&
                data &&
                data.conversations.map((c) => {
                  const isSelected = selected.has(c.id);
                  return (
                    <tr
                      key={c.id}
                      className={`hover:bg-gray-800/50 ${isSelected ? "bg-gray-800/30" : ""}`}
                    >
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleRow(c.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="rounded border-gray-600 bg-gray-800 text-red-600 focus:ring-red-500"
                        />
                      </td>
                      <td className="px-3 py-2 text-sm">
                        <div className="text-gray-100">
                          {c.visitor?.name || (
                            <span className="text-gray-500 italic">
                              anonymous
                            </span>
                          )}
                        </div>
                        {c.visitor?.email && (
                          <div className="text-xs text-gray-500">
                            {c.visitor.email}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-sm text-gray-300">
                        {c.visitor?.company || "—"}
                      </td>
                      <td className="px-3 py-2 text-sm text-gray-200 whitespace-nowrap">
                        {formatDate(c.startTime)}
                      </td>
                      <td className="px-3 py-2 text-sm text-gray-200">
                        {c.totalMessages}
                      </td>
                      <td className="px-3 py-2 text-sm">
                        <StatusBadge status={c.status} />
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <Link
                          to={`/admin/conversations/${c.id}`}
                          className="inline-block px-3 py-1.5 rounded-md bg-gradient-to-tr from-red-600 to-red-950 hover:shadow-lg text-white text-xs font-semibold transition-all"
                        >
                          View Details
                        </Link>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>

        {data && data.total > PAGE_SIZE && (
          <div className="flex items-center justify-between px-4 py-3 bg-gray-950 border-t border-gray-800 text-sm">
            <div className="text-gray-400">
              Page {page} of {totalPages}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => updateParams({ page: String(page - 1) })}
                disabled={page <= 1}
                aria-label="Previous page"
                className="w-8 h-8 flex items-center justify-center rounded-md border border-gray-700 bg-gray-900 hover:bg-gray-800 text-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ‹
              </button>
              {getPageItems(page, totalPages).map((p, i) =>
                p === "…" ? (
                  <span
                    key={`gap-${i}`}
                    className="w-8 h-8 flex items-center justify-center text-gray-500"
                  >
                    …
                  </span>
                ) : (
                  <button
                    key={p}
                    onClick={() => updateParams({ page: String(p) })}
                    aria-current={p === page ? "page" : undefined}
                    className={`w-8 h-8 flex items-center justify-center rounded-md text-xs font-medium transition-colors ${
                      p === page
                        ? "bg-gradient-to-tr from-red-600 to-red-950 text-white border border-red-700"
                        : "border border-gray-700 bg-gray-900 hover:bg-gray-800 text-gray-100"
                    }`}
                  >
                    {p}
                  </button>
                ),
              )}
              <button
                onClick={() => updateParams({ page: String(page + 1) })}
                disabled={page >= totalPages}
                aria-label="Next page"
                className="w-8 h-8 flex items-center justify-center rounded-md border border-gray-700 bg-gray-900 hover:bg-gray-800 text-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ›
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Analytics charts (Phase E) — placed below the list, only on page 1
          with no filters so the 14-day totals match the unfiltered data. */}
      {page === 1 && !search && !statusCsv && <ConversationStats />}
    </div>
  );
}
