"use client";

import { useEffect, useState } from "react";

export default function AdminPage() {
  const [scans, setScans] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/scans/list");
      const j = await r.json();
      if (Array.isArray(j)) setScans(j);
      else setScans([]);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const clearAll = async () => {
    if (!confirm("Delete all scans for today? This cannot be undone.")) return;
    setClearing(true);
    try {
      const r = await fetch("/api/scans/clear", { method: "POST" });
      const j = await r.json();
      if (j && j.ok) {
        await load();
      } else {
        setError((j && j.error) || "clear failed");
      }
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-semibold">Admin — Today's Scans</h1>
          <div className="flex items-center gap-2">
            <button
              className="px-3 py-1 bg-red-600 text-white rounded"
              onClick={clearAll}
              disabled={clearing}
            >
              {clearing ? "Clearing..." : "Clear all"}
            </button>
            <button className="px-3 py-1 bg-muted rounded" onClick={load}>
              Refresh
            </button>
          </div>
        </div>

        {error && <div className="text-sm text-red-600 mb-2">{error}</div>}
        {loading ? (
          <div>Loading…</div>
        ) : (
          <div className="overflow-auto border rounded bg-panel border-default">
            <table className="w-full text-sm">
              <thead className="text-left bg-muted">
                <tr>
                  <th className="p-2">Text / Key</th>
                  <th className="p-2">Count</th>
                  <th className="p-2">First seen</th>
                  <th className="p-2">Last seen</th>
                  <th className="p-2">Uses</th>
                </tr>
              </thead>
              <tbody>
                {scans.map((s, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-2 align-top font-mono break-words max-w-xs">{s.text || s.key}</td>
                    <td className="p-2 align-top">{s.count ?? 0}</td>
                    <td className="p-2 align-top">{s.firstSeen ? new Date(s.firstSeen).toLocaleString() : "-"}</td>
                    <td className="p-2 align-top">{s.lastSeen ? new Date(s.lastSeen).toLocaleString() : "-"}</td>
                    <td className="p-2 align-top">
                      {Array.isArray(s.uses) && s.uses.length > 0 ? (
                        <ul className="list-disc pl-5 max-h-40 overflow-auto">
                          {s.uses.map((u: any, idx: number) => (
                            <li key={idx}>{u.at ? new Date(u.at).toLocaleString() : JSON.stringify(u)}</li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-xs text-gray-500">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
