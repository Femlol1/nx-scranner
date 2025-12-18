"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

export default function AdminPage() {
	const [scans, setScans] = useState<any[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [clearing, setClearing] = useState(false);
	const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);
	const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
	const [search, setSearch] = useState<string>("");
	const [currentPage, setCurrentPage] = useState<number>(1);
	const [pageSize, setPageSize] = useState<number>(50);
	const [debouncedSearch, setDebouncedSearch] = useState<string>("");
	// using sonner toast instead of local Toast component
	const searchRef = useRef<HTMLInputElement | null>(null);
	const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);

	const load = async (page: number = 1, limit: number = 50) => {
		setLoading(true);
		setError(null);
		try {
			const r = await fetch(`/api/scans/list?page=${page}&limit=${limit}`);
			if (!r.ok) {
				throw new Error(`Failed to load scans: ${r.status} ${r.statusText}`);
			}
			const j = await r.json();
			let items: any[] = [];
			if (Array.isArray(j)) items = j;
			else if (j && Array.isArray(j.scans)) items = j.scans;
			else if (j && Array.isArray(j.data)) items = j.data;
			else if (j && Array.isArray(j.items)) items = j.items;
			else if (j && j.ok && Array.isArray(j.result)) items = j.result;
			else items = [];
			// sort by lastSeen desc for better UX
			items.sort((a: any, b: any) => {
				const A = a.lastSeen ? new Date(a.lastSeen).getTime() : 0;
				const B = b.lastSeen ? new Date(b.lastSeen).getTime() : 0;
				return B - A;
			});
			setScans(items);
			setLastRefreshed(new Date().toLocaleString());
		} catch (e: any) {
			const errMsg = e?.message || String(e);
			setError(errMsg);
			toast.error(`Failed to load scans: ${errMsg}`);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		load(currentPage, pageSize);
	}, [currentPage, pageSize]);

	// Debounce search input
	useEffect(() => {
		if (searchDebounceRef.current) {
			clearTimeout(searchDebounceRef.current);
		}
		searchDebounceRef.current = setTimeout(() => {
			setDebouncedSearch(search);
		}, 300);
		return () => {
			if (searchDebounceRef.current) {
				clearTimeout(searchDebounceRef.current);
			}
		};
	}, [search]);

	const clearAll = async () => {
		if (!confirm("Delete all scans for today? This cannot be undone.")) return;
		setClearing(true);
		try {
			const r = await fetch("/api/scans/clear", { method: "POST" });
			const j = await r.json().catch(() => ({}));
			if (j && (j.ok || j.deletedCount >= 0)) {
				setCurrentPage(1); // Reset to first page
				await load(1, pageSize);
				toast.success("Cleared today's scans");
			} else {
				const eMsg = (j && j.error) || "clear failed";
				setError(eMsg);
				toast.error(`Clear failed: ${eMsg}`);
			}
		} catch (e: any) {
			setError(e?.message || String(e));
			toast.error(`Clear failed: ${e?.message || String(e)}`);
		} finally {
			setClearing(false);
		}
	};

	/**
	 * Exports scan data as CSV file for download.
	 */
	const exportScans = () => {
		if (scans.length === 0) {
			toast.error("No scans to export");
			return;
		}
		try {
			// Create CSV content
			const headers = ["Key", "Text", "Count", "First Seen", "Last Seen"];
			const rows = scans.map((s) => [
				s.key || "",
				(s.text || "").replace(/"/g, '""'), // Escape quotes
				s.count || 0,
				s.firstSeen ? new Date(s.firstSeen).toLocaleString() : "",
				s.lastSeen ? new Date(s.lastSeen).toLocaleString() : "",
			]);
			const csv = [
				headers.join(","),
				...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
			].join("\n");

			// Download file
			const blob = new Blob([csv], { type: "text/csv" });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = `scans-${new Date().toISOString().split("T")[0]}.csv`;
			a.click();
			URL.revokeObjectURL(url);
			toast.success("Export successful");
		} catch (e: any) {
			toast.error(`Export failed: ${e?.message || String(e)}`);
		}
	};

	const filteredScans = useMemo(() => {
		const q = (debouncedSearch || "").trim().toLowerCase();
		if (!q) return scans;
		return scans.filter((s) => {
			const text = (s.text || "" + s.key || "").toString().toLowerCase();
			const key = (s.key || "").toString().toLowerCase();
			return text.includes(q) || key.includes(q);
		});
	}, [scans, debouncedSearch]);

	return (
		<div
			className="min-h-screen p-6"
			style={{
				background: "linear-gradient(var(--background), var(--panel-bg))",
			}}
		>
			<div className="max-w-6xl mx-auto">
				<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
					<div className="flex items-center gap-3">
						<h1 className="text-2xl font-semibold">Admin — Today's Scans</h1>
						<div className="text-sm text-gray-500">{scans.length} total</div>
						{lastRefreshed && (
							<div className="text-xs text-gray-400">
								• refreshed {lastRefreshed}
							</div>
						)}
					</div>

					<div className="flex items-center gap-2 flex-wrap">
						<input
							ref={searchRef}
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							placeholder="Filter by text or key"
							className="px-2 py-1 border rounded text-sm bg-panel"
							aria-label="Filter scans"
						/>
						<select
							value={pageSize}
							onChange={(e) => {
								setPageSize(Number(e.target.value));
								setCurrentPage(1);
							}}
							className="px-2 py-1 border rounded text-sm bg-panel"
							aria-label="Items per page"
						>
							<option value={25}>25</option>
							<option value={50}>50</option>
							<option value={100}>100</option>
							<option value={200}>200</option>
						</select>
						<button
							className="btn"
							onClick={async () => {
								await load(currentPage, pageSize);
								try {
									toast.info("Refreshed");
								} catch {}
							}}
							title="Refresh list"
							disabled={loading}
						>
							{loading ? "Refreshing..." : "Refresh"}
						</button>
						<button
							className="btn btn-danger"
							onClick={clearAll}
							disabled={clearing}
							title="Clear all scans for today"
						>
							{clearing ? "Clearing..." : "Clear all"}
						</button>
					</div>
				</div>

				{error && <div className="text-sm text-red-600 mb-2">{error}</div>}

				{/* Notifications handled by Sonner <Toaster /> in layout */}

				<div className="mb-3 flex items-center justify-between">
					<div className="text-xs text-gray-500">
						{lastRefreshed
							? `Last refreshed: ${lastRefreshed}`
							: "Not yet loaded"}
					</div>
					<div className="flex items-center gap-2">
						<button
							className="btn btn-muted text-sm"
							onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
							disabled={currentPage === 1 || loading}
							aria-label="Previous page"
						>
							← Prev
						</button>
						<span className="text-sm text-gray-600">Page {currentPage}</span>
						<button
							className="btn btn-muted text-sm"
							onClick={() => setCurrentPage((p) => p + 1)}
							disabled={scans.length < pageSize || loading}
							aria-label="Next page"
						>
							Next →
						</button>
					</div>
				</div>

				{loading ? (
					<div className="p-4 bg-panel border-default rounded">Loading…</div>
				) : (
					<div className="space-y-3">
						{filteredScans.length === 0 && (
							<div className="p-4 bg-panel border-default rounded text-sm text-gray-600">
								No scans match your filter.
							</div>
						)}

						<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
							{filteredScans.map((s, i) => (
								<div
									key={i}
									className="p-3 bg-panel border-default rounded shadow-sm"
								>
									<div className="flex items-start justify-between gap-3">
										<div className="flex-1">
											<div className="font-mono text-sm break-words break-all max-w-full whitespace-pre-wrap">
												{s.text || s.key}
											</div>
											<div className="text-xs text-gray-500 mt-1">
												Key:{" "}
												<span className="font-mono break-all">
													{s.key ?? "-"}
												</span>
											</div>
										</div>
										<div className="text-right">
											<div className="text-sm font-medium">{s.count ?? 0}×</div>
											<div className="text-xs text-gray-500">
												{s.lastSeen
													? new Date(s.lastSeen).toLocaleString()
													: "-"}
											</div>
										</div>
									</div>

									<div className="mt-3 flex items-center justify-between">
										<div className="text-xs text-gray-500">
											First:{" "}
											{s.firstSeen
												? new Date(s.firstSeen).toLocaleString()
												: "-"}
										</div>
										<div className="flex items-center gap-2">
											<button
												className="btn btn-muted text-xs"
												onClick={() =>
													navigator.clipboard?.writeText(s.text || s.key || "")
												}
											>
												Copy
											</button>
											<button
												className="btn btn-muted text-xs"
												onClick={() =>
													setExpandedIndex(expandedIndex === i ? null : i)
												}
											>
												{expandedIndex === i ? "Hide" : "Details"}
											</button>
										</div>
									</div>

									{expandedIndex === i && (
										<div className="mt-3 bg-muted p-2 rounded text-xs">
											<div className="mb-2 font-medium">Uses</div>
											{Array.isArray(s.uses) && s.uses.length > 0 ? (
												<ul className="list-disc pl-5 max-h-40 overflow-auto">
													{s.uses.map((u: any, idx: number) => (
														<li key={idx} className="break-all">
															{u.at
																? new Date(u.at).toLocaleString()
																: JSON.stringify(u)}
														</li>
													))}
												</ul>
											) : (
												<div className="text-xs text-gray-500">
													No uses recorded
												</div>
											)}

											<div className="mt-2">
												<div className="text-xs text-gray-600">
													Raw document
												</div>
												<pre className="text-xs font-mono p-2 bg-panel-quiet rounded max-h-48 overflow-auto whitespace-pre-wrap break-words">
													{JSON.stringify(s, null, 2)}
												</pre>
											</div>
										</div>
									)}
								</div>
							))}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
