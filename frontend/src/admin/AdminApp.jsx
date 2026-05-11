// Admin app shell. Loads only on /admin/* routes (lazy-chunked from main.jsx).
// Auth is enforced by lib/adminAuth.js inline in each /api/admin/* Lambda;
// if we reach this component, the user has provided valid credentials.

import { lazy, Suspense } from "react";
import { Navigate, NavLink, Route, Routes } from "react-router-dom";

const ConversationsList = lazy(() => import("./ConversationsList.jsx"));
const ConversationDetail = lazy(() => import("./ConversationDetail.jsx"));

function PaneLoading() {
  return (
    <div className="p-8 text-sm text-gray-400">Loading…</div>
  );
}

export default function AdminApp() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-3 flex items-center gap-6">
        <div className="text-lg font-bold bg-gradient-to-tr from-red-500 to-red-200 bg-clip-text text-transparent">
          ZAPTEST Admin
        </div>
        <nav className="flex gap-4 text-sm">
          <NavLink
            to="/admin/conversations"
            className={({ isActive }) =>
              isActive
                ? "text-red-400 font-medium"
                : "text-gray-400 hover:text-gray-100"
            }
          >
            Conversations
          </NavLink>
        </nav>
      </header>
      <main className="max-w-7xl mx-auto px-6 py-6">
        <Suspense fallback={<PaneLoading />}>
          <Routes>
            <Route index element={<Navigate to="conversations" replace />} />
            <Route path="conversations" element={<ConversationsList />} />
            <Route
              path="conversations/:id"
              element={<ConversationDetail />}
            />
            <Route
              path="*"
              element={
                <div className="text-sm text-gray-400">Not found.</div>
              }
            />
          </Routes>
        </Suspense>
      </main>
    </div>
  );
}
