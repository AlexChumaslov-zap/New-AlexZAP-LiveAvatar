import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import App from './App.jsx';
import './App.css';

// Admin chunk is lazy so the public iframe doesn't download admin code.
const AdminApp = lazy(() => import('./admin/AdminApp.jsx'));

function AdminLoading() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-gray-50 text-gray-500 text-sm">
      Loading admin…
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route
          path="/admin/*"
          element={
            <Suspense fallback={<AdminLoading />}>
              <AdminApp />
            </Suspense>
          }
        />
        <Route path="*" element={<App />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
