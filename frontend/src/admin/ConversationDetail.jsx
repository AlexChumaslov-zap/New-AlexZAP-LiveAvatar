// Conversation detail — dark theme matching AlexZAP's HeroUI dark chrome.
//
// Features:
//   - Phase C: read-only conversation + messages + reports
//   - Phase D: End / Delete buttons in header, delete confirmation modal
//   - Phase F: Generate / Refresh Reports button, structured report renderer
//     (Lead Pre-Qualification / Pain Points / Tech Stack get custom layouts,
//     everything else falls through to a generic key/value view)
//
// Auth gate is upstream (admin-auth edge function); no client-side auth check.

import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Markdown from "react-markdown";

// ── helpers ─────────────────────────────────────────────────────────────

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDuration(ms) {
  if (ms == null || ms < 0) return "—";
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

function formatKey(key) {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

const STATUS_CHIP = {
  active: "bg-emerald-500/20 text-emerald-300",
  ended: "bg-amber-500/20 text-amber-200",
  exported: "bg-sky-500/20 text-sky-200",
};

function StatusChip({ status }) {
  return (
    <span
      className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${
        STATUS_CHIP[status] || "bg-gray-700 text-gray-300"
      }`}
    >
      {status}
    </span>
  );
}

const RATING_CHIP = {
  Hot: "bg-red-500/25 text-red-200 border border-red-500/40",
  Warm: "bg-amber-500/25 text-amber-200 border border-amber-500/40",
  Cold: "bg-sky-500/20 text-sky-300 border border-sky-500/30",
};

function RatingChip({ rating }) {
  if (!rating) return null;
  return (
    <span
      className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${
        RATING_CHIP[rating] || "bg-gray-700 text-gray-300"
      }`}
      title="Lead qualification rating (from AI report)"
    >
      {rating}
    </span>
  );
}

function InfoRow({ label, children }) {
  return (
    <p className="text-sm">
      <strong className="text-gray-200">{label}:</strong>{" "}
      <span className="text-gray-400">{children}</span>
    </p>
  );
}

// ── report rendering (Phase F) ──────────────────────────────────────────

function Chip({ children, tone = "default" }) {
  const tones = {
    success: "bg-emerald-500/20 text-emerald-300",
    danger: "bg-red-500/20 text-red-300",
    warning: "bg-amber-500/20 text-amber-200",
    primary: "bg-red-500/20 text-red-200",
    default: "bg-gray-700 text-gray-200",
  };
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${tones[tone] || tones.default}`}
    >
      {children}
    </span>
  );
}

function renderGenericValue(value) {
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-gray-500">None</span>;
    return (
      <ul className="list-disc pl-5 mt-1 text-gray-300">
        {value.map((item, i) => (
          <li key={i}>
            {typeof item === "object" && item !== null
              ? JSON.stringify(item)
              : String(item)}
          </li>
        ))}
      </ul>
    );
  }
  if (typeof value === "object" && value !== null) {
    if (Object.keys(value).length === 0)
      return <span className="text-gray-500">None</span>;
    return (
      <pre className="bg-black/40 rounded p-2 mt-1 overflow-auto text-xs text-gray-300 font-mono">
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  }
  if (typeof value === "boolean") {
    return <Chip tone={value ? "success" : "danger"}>{value ? "Yes" : "No"}</Chip>;
  }
  if (typeof value === "number") {
    return <span className="text-gray-200">{value.toLocaleString()}</span>;
  }
  if (value === "" || value == null) {
    return <span className="text-gray-500">Not specified</span>;
  }
  return <span className="text-gray-200">{String(value)}</span>;
}

function renderLeadQualification(data) {
  const known = ["interestLevel", "budget", "decisionMaker", "timeline", "readiness"];
  const rest = Object.entries(data).filter(([k]) => !known.includes(k));
  return (
    <div className="space-y-3">
      {data.interestLevel !== undefined && (
        <div className="flex justify-between items-center">
          <span className="font-semibold text-gray-200">Interest level:</span>
          <Chip
            tone={
              String(data.interestLevel).toLowerCase() === "high"
                ? "success"
                : String(data.interestLevel).toLowerCase() === "medium"
                  ? "warning"
                  : "danger"
            }
          >
            <span className="capitalize">{data.interestLevel || "Low"}</span>
          </Chip>
        </div>
      )}
      {data.budget !== undefined && (
        <div className="flex justify-between">
          <span className="font-semibold text-gray-200">Budget:</span>
          <span className="text-gray-300">{data.budget || "Unknown"}</span>
        </div>
      )}
      {data.decisionMaker !== undefined && (
        <div className="flex justify-between items-center">
          <span className="font-semibold text-gray-200">Decision maker:</span>
          <Chip tone={data.decisionMaker ? "success" : "danger"}>
            {data.decisionMaker ? "Yes" : "No"}
          </Chip>
        </div>
      )}
      {data.timeline !== undefined && (
        <div className="flex justify-between">
          <span className="font-semibold text-gray-200">Timeline:</span>
          <span className="text-gray-300">{data.timeline || "Not specified"}</span>
        </div>
      )}
      {data.readiness !== undefined && (
        <div className="flex justify-between">
          <span className="font-semibold text-gray-200">Purchase readiness:</span>
          <span className="text-gray-300">{data.readiness || "Not specified"}</span>
        </div>
      )}
      {rest.map(([k, v]) => (
        <div key={k} className="flex justify-between items-start gap-3">
          <span className="font-semibold text-gray-200 whitespace-nowrap">
            {formatKey(k)}:
          </span>
          <div className="text-right max-w-[60%]">{renderGenericValue(v)}</div>
        </div>
      ))}
    </div>
  );
}

function renderPainPoints(data) {
  const known = ["mainProblems", "currentTools", "desiredOutcomes"];
  const rest = Object.entries(data).filter(([k]) => !known.includes(k));
  return (
    <div className="space-y-3">
      {"mainProblems" in data && (
        <div>
          <span className="font-semibold text-gray-200">Main problems:</span>
          {Array.isArray(data.mainProblems) && data.mainProblems.length > 0 ? (
            <ul className="list-disc pl-5 mt-1 text-gray-300">
              {data.mainProblems.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          ) : (
            <div className="mt-1 text-gray-500">None identified</div>
          )}
        </div>
      )}
      {"currentTools" in data && (
        <div>
          <span className="font-semibold text-gray-200">Current tools:</span>
          {Array.isArray(data.currentTools) && data.currentTools.length > 0 ? (
            <div className="flex flex-wrap gap-1 mt-1">
              {data.currentTools.map((t, i) => (
                <Chip key={i}>{t}</Chip>
              ))}
            </div>
          ) : (
            <div className="mt-1 text-gray-500">None identified</div>
          )}
        </div>
      )}
      {"desiredOutcomes" in data && (
        <div>
          <span className="font-semibold text-gray-200">Desired outcomes:</span>
          {Array.isArray(data.desiredOutcomes) && data.desiredOutcomes.length > 0 ? (
            <ul className="list-disc pl-5 mt-1 text-gray-300">
              {data.desiredOutcomes.map((o, i) => (
                <li key={i}>{o}</li>
              ))}
            </ul>
          ) : (
            <div className="mt-1 text-gray-500">None identified</div>
          )}
        </div>
      )}
      {rest.map(([k, v]) => (
        <div key={k}>
          <span className="font-semibold text-gray-200">{formatKey(k)}:</span>
          <div className="mt-1">{renderGenericValue(v)}</div>
        </div>
      ))}
    </div>
  );
}

function renderTechStack(data) {
  const known = ["tools", "methodology", "integrations"];
  const rest = Object.entries(data).filter(([k]) => !known.includes(k));
  return (
    <div className="space-y-3">
      {"tools" in data && (
        <div>
          <span className="font-semibold text-gray-200">Tools:</span>
          {Array.isArray(data.tools) && data.tools.length > 0 ? (
            <div className="flex flex-wrap gap-1 mt-1">
              {data.tools.map((t, i) => (
                <Chip key={i}>{t}</Chip>
              ))}
            </div>
          ) : (
            <div className="mt-1 text-gray-500">None identified</div>
          )}
        </div>
      )}
      {data.methodology !== undefined && (
        <div className="flex justify-between">
          <span className="font-semibold text-gray-200">Methodology:</span>
          <span className="text-gray-300">{data.methodology}</span>
        </div>
      )}
      {"integrations" in data && (
        <div>
          <span className="font-semibold text-gray-200">Integrations:</span>
          {Array.isArray(data.integrations) && data.integrations.length > 0 ? (
            <div className="flex flex-wrap gap-1 mt-1">
              {data.integrations.map((t, i) => (
                <Chip key={i}>{t}</Chip>
              ))}
            </div>
          ) : (
            <div className="mt-1 text-gray-500">None identified</div>
          )}
        </div>
      )}
      {rest.map(([k, v]) => (
        <div key={k}>
          <span className="font-semibold text-gray-200">{formatKey(k)}:</span>
          <div className="mt-1">{renderGenericValue(v)}</div>
        </div>
      ))}
    </div>
  );
}

function renderGenericReport(data) {
  if (!data || Object.keys(data).length === 0) {
    return <p className="italic text-gray-500">No data in this report.</p>;
  }
  return (
    <div className="space-y-3">
      {Object.entries(data).map(([k, v]) => (
        <div key={k}>
          <span className="font-semibold text-gray-200">{formatKey(k)}:</span>
          <div className="mt-1">{renderGenericValue(v)}</div>
        </div>
      ))}
    </div>
  );
}

// Big colored chip for the lead rating, with same color logic as the
// Rating column on the list view but sized up for the detail card.
function renderQualificationAssessment(data) {
  const rating = data.Rating;
  const tones = {
    Hot: "bg-red-500/25 text-red-200 border border-red-500/40",
    Warm: "bg-amber-500/25 text-amber-200 border border-amber-500/40",
    Cold: "bg-sky-500/20 text-sky-300 border border-sky-500/30",
  };
  const tone = tones[rating] || "bg-gray-700 text-gray-300";
  return (
    <div className="flex items-center gap-3">
      <span className="text-gray-400 text-sm">Lead rating:</span>
      <span className={`px-3 py-1 rounded-full text-base font-bold ${tone}`}>
        {rating || "Not rated"}
      </span>
    </div>
  );
}

function renderRecommendedNextActions(data) {
  const actions = Array.isArray(data.Actions) ? data.Actions : [];
  if (actions.length === 0) {
    return (
      <p className="italic text-gray-500">No next actions recommended.</p>
    );
  }
  return (
    <ol className="list-decimal pl-5 space-y-1.5 text-gray-200">
      {actions.map((a, i) => (
        <li key={i} className="leading-relaxed">
          {String(a)}
        </li>
      ))}
    </ol>
  );
}

function renderReportContent(report) {
  const type = report.name.toLowerCase();
  const data = report.reportData || {};
  if (!data || Object.keys(data).length === 0) {
    return <p className="italic text-gray-500">No data in this report.</p>;
  }
  if (type.includes("qualification assessment")) {
    return renderQualificationAssessment(data);
  }
  if (type.includes("next actions")) {
    return renderRecommendedNextActions(data);
  }
  if (type.includes("lead qualification") || type.includes("pre-qualification")) {
    return renderLeadQualification(data);
  }
  if (type.includes("pain points")) return renderPainPoints(data);
  if (type.includes("tech stack")) return renderTechStack(data);
  return renderGenericReport(data);
}

function ReportItem({ report }) {
  const [open, setOpen] = useState(false);
  return (
    <details
      open={open}
      onToggle={(e) => setOpen(e.target.open)}
      className="border border-gray-700 rounded-lg bg-gray-900"
    >
      <summary className="cursor-pointer list-none px-4 py-3 flex justify-between items-center hover:bg-gray-800 rounded-lg">
        <span className="font-medium text-gray-100">{report.name}</span>
        <span className="text-xs text-gray-400">
          {formatDate(report.generatedAt)}
          <span className="ml-3 text-gray-500">{open ? "▲" : "▼"}</span>
        </span>
      </summary>
      <div className="px-4 py-4 border-t border-gray-700 bg-gray-950">
        {renderReportContent(report)}
      </div>
    </details>
  );
}

// ── main component ──────────────────────────────────────────────────────

export default function ConversationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Action state
  const [endBusy, setEndBusy] = useState(false);
  const [generateBusy, setGenerateBusy] = useState(false);
  const [generateError, setGenerateError] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [sfBusy, setSfBusy] = useState(false);
  const [sfMessage, setSfMessage] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/admin/conversations/${encodeURIComponent(id)}/detail`, {
      credentials: "same-origin",
    })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${r.status}`);
        }
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
  }, [id, reloadKey]);

  async function handleEndConversation() {
    if (endBusy) return;
    if (!confirm("End this conversation?")) return;
    setEndBusy(true);
    try {
      const r = await fetch(
        `/api/admin/conversations/${encodeURIComponent(id)}/end`,
        { method: "POST", credentials: "same-origin" },
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setReloadKey((k) => k + 1);
    } catch (e) {
      alert(`End failed: ${e.message || e}`);
    } finally {
      setEndBusy(false);
    }
  }

  async function handleConfirmDelete() {
    if (deleteBusy) return;
    setDeleteBusy(true);
    try {
      const r = await fetch(
        `/api/admin/conversations/${encodeURIComponent(id)}/delete`,
        { method: "POST", credentials: "same-origin" },
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      navigate("/admin/conversations");
    } catch (e) {
      alert(`Delete failed: ${e.message || e}`);
    } finally {
      setDeleteBusy(false);
      setShowDeleteModal(false);
    }
  }

  async function handlePushSalesforce() {
    if (sfBusy) return;
    if (!confirm("Push this conversation as a Lead to Salesforce?")) return;
    setSfBusy(true);
    setSfMessage(null);
    try {
      const r = await fetch(
        `/api/admin/conversations/${encodeURIComponent(id)}/push-salesforce`,
        { method: "POST", credentials: "same-origin" },
      );
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (r.status === 503 && body.error === "salesforce_not_configured") {
          throw new Error(
            "Salesforce env vars not set on this deployment.",
          );
        }
        throw new Error(body.message || body.error || `HTTP ${r.status}`);
      }
      setSfMessage({
        kind: "ok",
        text: body.leadId
          ? `Lead created in Salesforce (ID: ${body.leadId}).`
          : "Lead created in Salesforce.",
      });
      setReloadKey((k) => k + 1);
    } catch (e) {
      setSfMessage({ kind: "err", text: e.message || String(e) });
    } finally {
      setSfBusy(false);
    }
  }

  async function handleGenerateReports() {
    if (generateBusy) return;
    setGenerateBusy(true);
    setGenerateError(null);
    try {
      const r = await fetch(`/api/admin/reports/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ conversationId: id }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(body.error || body.message || `HTTP ${r.status}`);
      }
      setReloadKey((k) => k + 1);
    } catch (e) {
      setGenerateError(e.message || String(e));
    } finally {
      setGenerateBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="bg-gray-900 rounded-lg border border-gray-800 p-8 text-center text-sm text-gray-400">
        Loading conversation…
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-gray-900 rounded-lg border border-gray-800 p-8">
        <Link
          to="/admin/conversations"
          className="text-sm text-gray-400 hover:text-gray-100"
        >
          ← Back to conversations
        </Link>
        <p className="mt-4 text-red-300">
          Couldn't load conversation: {error}
        </p>
      </div>
    );
  }

  const { conversation, messages, reports } = data;
  const visitor = conversation.visitor;
  const isActive = conversation.status === "active";

  // Extract the qualification rating from the most recent qualification
  // report (if any) so we can show a Hot/Warm/Cold chip in the header.
  const qualificationRating = (() => {
    const r = reports.find((r) =>
      r.name.toLowerCase().includes("qualification assessment"),
    );
    const v = r?.reportData?.Rating;
    return v === "Hot" || v === "Warm" || v === "Cold" ? v : null;
  })();

  return (
    <div className="space-y-4">
      <Link
        to="/admin/conversations"
        className="inline-block text-sm text-gray-400 hover:text-gray-100"
      >
        ← Back to conversations
      </Link>

      <div className="bg-gray-900 rounded-lg border border-gray-800">
        {/* Header */}
        <div className="px-6 py-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-red-300">
              Conversation Details
            </h1>
            <p className="text-xs text-gray-500 font-mono mt-1">
              ID: {conversation.id}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <RatingChip rating={qualificationRating} />
            <StatusChip status={conversation.status} />
            {isActive && (
              <button
                onClick={handleEndConversation}
                disabled={endBusy}
                className="px-3 py-1.5 rounded-md bg-amber-600/30 hover:bg-amber-600/50 disabled:opacity-50 text-amber-200 text-xs font-semibold border border-amber-700 transition-colors"
              >
                {endBusy ? "Ending…" : "End conversation"}
              </button>
            )}
            <button
              onClick={handlePushSalesforce}
              disabled={sfBusy}
              title="Create a Lead in Salesforce from this conversation"
              className="px-3 py-1.5 rounded-md bg-gradient-to-tr from-red-600 to-red-950 hover:shadow-lg disabled:opacity-50 text-white text-xs font-semibold transition-all"
            >
              {sfBusy ? "Pushing…" : "Push to Salesforce"}
            </button>
            <button
              onClick={() => setShowDeleteModal(true)}
              className="px-3 py-1.5 rounded-md bg-red-700/40 hover:bg-red-700/60 text-red-100 text-xs font-semibold border border-red-700 transition-colors"
            >
              Delete
            </button>
          </div>
        </div>

        {sfMessage && (
          <div
            className={`mx-6 mb-3 px-4 py-3 rounded text-sm border ${
              sfMessage.kind === "ok"
                ? "bg-emerald-900/30 border-emerald-700 text-emerald-100"
                : "bg-red-900/40 border-red-700 text-red-100"
            }`}
          >
            {sfMessage.text}
          </div>
        )}

        {/* Info grid */}
        <div className="border-t border-gray-800 px-6 py-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1.5">
              <h2 className="text-base font-semibold text-gray-100 mb-2">
                Visitor Information
              </h2>
              <InfoRow label="Name">{visitor?.name || "Unknown"}</InfoRow>
              <InfoRow label="Company">
                {visitor?.company || "Unknown"}
              </InfoRow>
              <InfoRow label="Email">
                {visitor?.email ? (
                  <a
                    href={`mailto:${visitor.email}`}
                    className="text-red-300 hover:underline"
                  >
                    {visitor.email}
                  </a>
                ) : (
                  "Not provided"
                )}
              </InfoRow>
              <InfoRow label="First visit">
                {formatDate(visitor?.firstVisit)}
              </InfoRow>
              <InfoRow label="Last visit">
                {formatDate(visitor?.lastVisit)}
              </InfoRow>
            </div>
            <div className="space-y-1.5">
              <h2 className="text-base font-semibold text-gray-100 mb-2">
                Conversation Information
              </h2>
              <InfoRow label="Started">
                {formatDate(conversation.startTime)}
              </InfoRow>
              <InfoRow label="Ended">
                {conversation.endTime
                  ? formatDate(conversation.endTime)
                  : "Active"}
              </InfoRow>
              <InfoRow label="Duration">
                {formatDuration(conversation.durationMs)}
              </InfoRow>
              <InfoRow label="Total messages">
                {conversation.totalMessages}
              </InfoRow>
            </div>
          </div>
        </div>

        {/* Transcript */}
        <div className="border-t border-gray-800 px-6 py-5">
          <h2 className="text-base font-semibold text-gray-100 mb-3">
            Conversation History
          </h2>
          {messages.length === 0 ? (
            <p className="text-center py-6 text-sm text-gray-500">
              No messages in this conversation.
            </p>
          ) : (
            <div className="max-h-[600px] overflow-y-auto p-4 bg-black/40 rounded-lg">
              {messages.map((m) => {
                const isVisitor = m.sender === "visitor" || m.sender === "user";
                return (
                  <div
                    key={m.id}
                    className={`mb-4 ${isVisitor ? "text-right" : "text-left"}`}
                  >
                    <div
                      className={`inline-block p-3 rounded-lg max-w-[80%] text-left ${
                        isVisitor
                          ? "bg-red-900/50 text-red-50"
                          : "bg-gray-800 text-gray-100"
                      }`}
                    >
                      <p className="text-xs text-gray-400">
                        {isVisitor
                          ? visitor?.name || "Visitor"
                          : "Avatar"}{" "}
                        • {formatDate(m.timestamp)}
                      </p>
                      <div className="mt-1 [&_p]:my-0 [&_p:not(:last-child)]:mb-2 [&_a]:underline [&_a]:text-red-300 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5">
                        <Markdown>{m.messageText}</Markdown>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Reports */}
        <div className="border-t border-gray-800 px-6 py-5">
          <div className="flex flex-wrap justify-between items-center gap-2 mb-3">
            <h2 className="text-base font-semibold text-gray-100">
              AI Analysis Reports
            </h2>
            <button
              onClick={handleGenerateReports}
              disabled={generateBusy}
              className="px-4 py-2 rounded-full bg-gradient-to-tr from-red-600 to-red-950 text-white text-sm font-semibold hover:shadow-lg disabled:opacity-50 transition-all duration-300"
            >
              {generateBusy
                ? "Generating…"
                : reports.length === 0
                  ? "Generate Reports"
                  : "Refresh Reports"}
            </button>
          </div>
          {generateError && (
            <div className="mb-3 px-4 py-3 rounded bg-red-900/40 border border-red-700 text-red-100 text-sm">
              {generateError}
            </div>
          )}
          {generateBusy ? (
            <div className="flex flex-col items-center justify-center p-8 text-gray-300">
              <div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
              <p className="mt-4 text-sm">Generating AI reports…</p>
              <p className="text-xs text-gray-500">
                This may take up to 30 seconds
              </p>
            </div>
          ) : reports.length === 0 ? (
            <p className="text-center py-6 bg-black/30 rounded text-sm text-gray-500">
              No reports for this conversation yet.
            </p>
          ) : (
            <div className="space-y-2">
              {reports.map((r) => (
                <ReportItem key={r.id} report={r} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Delete confirmation modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl">
            <div className="px-6 py-4 border-b border-gray-800">
              <h3 className="text-lg font-bold text-gray-100">
                Delete Conversation
              </h3>
            </div>
            <div className="px-6 py-4 text-sm text-gray-300">
              Are you sure you want to delete this conversation? This action
              cannot be undone and will permanently remove all messages and
              reports associated with it.
            </div>
            <div className="px-6 py-4 border-t border-gray-800 flex justify-end gap-2">
              <button
                onClick={() => setShowDeleteModal(false)}
                disabled={deleteBusy}
                className="px-4 py-2 rounded-md text-sm text-gray-200 hover:bg-gray-800 disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={deleteBusy}
                className="px-4 py-2 rounded-md bg-red-700 hover:bg-red-600 text-white text-sm font-semibold disabled:opacity-50 transition-colors"
              >
                {deleteBusy ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
