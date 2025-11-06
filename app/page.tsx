"use client";

import jsQR from "jsqr";
import { useCallback, useEffect, useRef, useState } from "react";
import Toast from "../components/Toast";

export default function Home() {
	const videoRef = useRef<HTMLVideoElement | null>(null);
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const rafRef = useRef<number | null>(null);
	const detectorRef = useRef<any>(null);
	const imageCaptureRef = useRef<any>(null);
	const [scanning, setScanning] = useState(false);
	const [lastResult, setLastResult] = useState<string | null>(null);
	type HistoryEntry = {
		text: string;
		count: number;
		firstSeen: string; // ISO
		lastSeen: string; // ISO
	};

	const [history, setHistory] = useState<HistoryEntry[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
	const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
	const [singleScan, setSingleScan] = useState(false);
	const [torchAvailable, setTorchAvailable] = useState(false);
	const [torchOn, setTorchOn] = useState(false);

	// parsed result state
	const [parsed, setParsed] = useState<any | null>(null);
	const [validationErrors, setValidationErrors] = useState<string[]>([]);
	const [toastMessage, setToastMessage] = useState<string>("");
	const [lastUses, setLastUses] = useState<string[] | null>(null);

	// theme: 'light' | 'dark' | null (null = follow system)
	const [theme, setTheme] = useState<string | null>(null);

	const toggleTheme = () => {
		try {
			const next = theme === "dark" ? "light" : "dark";
			setTheme(next);
			localStorage.setItem("theme", next);
			document.documentElement.setAttribute("data-theme", next);
		} catch (e) {
			// ignore (SSR)
		}
	};

	// parse a QR payload of the colon-separated format into fields and validate
	const parseQrText = (text: string) => {
		const errors: string[] = [];
		const raw = (text || "").trim();
		if (!raw) {
			errors.push("Empty payload");
			return { raw, kind: null, fields: null, errors };
		}

		// ignore trailing colon
		const trimmed = raw.replace(/:$/g, "");

		// QIT format detection
		if (trimmed.startsWith("QIT:")) {
			// find the QCODE marker start ('::Q') and the separator '::#:::#:'
			const qStart = trimmed.indexOf("::Q");
			const sep = "::#:::#:";
			if (qStart === -1) {
				errors.push("missing QCODE marker '::Q'");
				return { raw, kind: "QIT", fields: null, errors };
			}
			const prefix = trimmed.slice(0, qStart);
			const after = trimmed.slice(qStart + 2); // starts with Q...
			const sepIdx = after.indexOf(sep);
			if (sepIdx === -1) {
				errors.push("missing QCODE separator '::#:::#:'");
				return { raw, kind: "QIT", fields: null, errors };
			}
			const qcodePart = after.slice(0, sepIdx).replace(/:^|:$/g, "");
			const unique = after.slice(sepIdx + sep.length).replace(/:$/g, "");

			const p = prefix.split(":");
			// expected: [QIT, Fxxx, RRDL####, TYPE, FARE, DEPART_DATETIME, ADULTS, CHILDREN, RETURN_DATETIME?]
			const flight = p[1] ?? null;
			const rrdl = p[2] ?? null;
			const type = (p[3] ?? "").toUpperCase();
			const fare = p[4] ?? null;
			const depart = p[5] ?? null;
			const adults = p[6] ?? null;
			const children = p[7] ?? null;
			const ret = p[8] ?? null;

			// validations
			if (!/^[A-Za-z0-9]+$/.test(flight || ""))
				errors.push("flight: invalid code");
			if (!/^RRDL[0-9]+$/.test(rrdl || ""))
				errors.push("rrdl: invalid RRDL code");
			if (!(type === "SINGLE" || type === "RETURN"))
				errors.push("type: must be SINGLE or RETURN");
			if (!/^[A-Z]{3,4}$/.test(fare || ""))
				errors.push("fare: expected CST/CFL/CFLL-like code");

			const parseDateTime = (s: string | null) => {
				if (!s) return null;
				if (!/^[0-9]{10}$/.test(s)) return null;
				// DDMMYYHHMM
				const dd = Number(s.slice(0, 2));
				const mm = Number(s.slice(2, 4));
				const yy = Number(s.slice(4, 6));
				const hh = Number(s.slice(6, 8));
				const min = Number(s.slice(8, 10));
				if (dd < 1 || dd > 31) return null;
				if (mm < 1 || mm > 12) return null;
				if (hh < 0 || hh > 23) return null;
				if (min < 0 || min > 59) return null;
				// build date (assume 2000+)
				const year = 2000 + yy;
				const d = new Date(year, mm - 1, dd, hh, min);
				if (isNaN(d.getTime())) return null;
				return d;
			};

			const departDt = parseDateTime(depart);
			const returnDt = ret ? parseDateTime(ret) : null;
			if (!departDt) errors.push("depart: invalid DDMMYYHHMM");
			if (type === "SINGLE" && ret)
				errors.push("return must be empty for SINGLE tickets");
			if (type === "RETURN") {
				if (!returnDt)
					errors.push(
						"return: invalid or missing DDMMYYHHMM for RETURN ticket"
					);
				else if (departDt && returnDt < departDt)
					errors.push("return: must be after or equal to depart");
			}

			// QIT date proximity rule: depart must not be more than 2 days in the future
			if (departDt) {
				const now = new Date();
				const msDiff = departDt.getTime() - now.getTime();
				const twoDaysMs = 2 * 24 * 60 * 60 * 1000;
				if (msDiff > twoDaysMs)
					errors.push("depart: more than 2 days away from now");
			}

			const nAdults = Number(adults);
			const nChildren = Number(children);
			if (!/^[0-9]+$/.test(adults ?? ""))
				errors.push("adults: must be integer >= 0");
			if (!/^[0-9]+$/.test(children ?? ""))
				errors.push("children: must be integer >= 0");

			if (!/^[0-9a-fA-F]{16,32}$/.test(unique || ""))
				errors.push("hash: invalid hex id");
			if (!/^Q[A-Za-z0-9]+$/.test(qcodePart || ""))
				errors.push("qcode: invalid format");

			const fields: any = {
				flight,
				rrdl,
				type,
				fare,
				depart: depart ?? null,
				return: ret ?? null,
				adults: Number.isNaN(nAdults) ? null : nAdults,
				children: Number.isNaN(nChildren) ? null : nChildren,
				qcode: qcodePart ?? null,
				hash: unique ?? null,
			};

			return { raw, kind: "QIT", fields, errors };
		}

		// short ticket parse: look for the ::#: markers
		const marker = "::#:";
		if (trimmed.indexOf(marker) === -1) {
			errors.push("missing '::#:' markers for short format");
			return { raw, kind: "short", fields: null, errors };
		}

		const parts = trimmed.split(marker);
		// expecting at least 3 parts: prefix, refs, hash
		if (parts.length < 3) {
			errors.push("unexpected short format segmentation");
			return { raw, kind: "short", fields: null, errors };
		}

		const prefix = parts[0];
		const refsPart = parts[1];
		const hashPart = parts.slice(2).join(marker); // in case extra markers

		const fieldsArr = prefix.split(":");
		// fieldsArr: [ticketNo, depart, return?, type, adults, children, fare, ...]
		const ticketNo = fieldsArr[0] ?? null;
		const depart = fieldsArr[1] ?? null;
		const ret = fieldsArr[2] ?? null;
		const type = (fieldsArr[3] ?? "").toLowerCase();
		const adults = fieldsArr[4] ?? null;
		const children = fieldsArr[5] ?? null;
		const fare = fieldsArr[6] ?? null;

		// bus refs: split by ':' and filter 4-letter codes
		const refs = (refsPart || "")
			.split(":")
			.filter((s) => !!s)
			.map((s) => s.trim())
			.filter(Boolean);

		const hash = (hashPart || "").replace(/:$/g, "");

		// validations
		if (!/^[A-Z][A-Z0-9]{3,11}$/.test(ticketNo || ""))
			errors.push("ticketNo: invalid format");

		const parseMMDD = (s: string | undefined) => {
			if (!s || !/^[0-9]{4}$/.test(s)) return false;
			const dd = Number(s.slice(0, 2));
			const mm = Number(s.slice(2, 4));
			if (mm < 1 || mm > 12) return false;
			if (dd < 1 || dd > 31) return false;
			return true;
		};

		if (!parseMMDD(depart)) errors.push("depart: invalid DDMM");
		if (type === "single") {
			if (ret) {
				// empty expected
				if (ret.trim() !== "")
					errors.push("return: must be empty for single tickets");
			}
		} else if (type === "return") {
			if (!parseMMDD(ret))
				errors.push("return: invalid DDMM for return ticket");
			else {
				// compare MMDD naive by month/day
				const depMonth = Number(depart?.slice(2, 4));
				const depDay = Number(depart?.slice(0, 2));
				const retMonth = Number(ret?.slice(2, 4));
				const retDay = Number(ret?.slice(0, 2));
				const depVal = depMonth * 100 + depDay;
				const retVal = retMonth * 100 + retDay;
				if (retVal < depVal) errors.push("return: must not be before depart");
			}
		} else {
			errors.push("type: must be single or return");
		}

		// Short ticket rule: depart must be today's date (DDMM)
		try {
			const now = new Date();
			const dd = String(now.getDate()).padStart(2, "0");
			const mm = String(now.getMonth() + 1).padStart(2, "0");
			const todayDDMM = dd + mm;
			if (depart !== todayDDMM) {
				errors.push("depart: ticket not for today");
			}
		} catch (e) {
			// ignore date compare errors
		}

		if (!/^[0-9]+$/.test(adults ?? ""))
			errors.push("adults: must be integer >= 0");
		if (!/^[0-9]+$/.test(children ?? ""))
			errors.push("children: must be integer >= 0");

		if (!/^(CST|CFL|CFLL)$/.test(fare ?? ""))
			errors.push("fare: must be CST, CFL, or CFLL");

		// validate refs
		const badRefs = refs.filter((r) => !/^[A-Z]{4}$/.test(r));
		if (badRefs.length > 0)
			errors.push("refs: invalid bus reference codes: " + badRefs.join(","));

		if (!/^[0-9a-fA-F]{16,32}$/.test(hash || ""))
			errors.push("hash: invalid hex id");

		const fields = {
			ticketNo,
			depart,
			return: ret && ret !== "" ? ret : null,
			type,
			adults: /^[0-9]+$/.test(adults ?? "") ? Number(adults) : null,
			children: /^[0-9]+$/.test(children ?? "") ? Number(children) : null,
			fare,
			refs,
			hash,
		};

		return { raw, kind: "short", fields, errors };
	};

	useEffect(() => {
		// load theme preference from localStorage (if present)
		try {
			const s = localStorage.getItem("theme");
			if (s === "light" || s === "dark") {
				setTheme(s);
				document.documentElement.setAttribute("data-theme", s);
			} else {
				setTheme(null);
				document.documentElement.removeAttribute("data-theme");
			}
		} catch (e) {
			// ignore (SSR or security)
		}
		// create BarcodeDetector if available
		const BD = (globalThis as any).BarcodeDetector;
		if (BD) {
			try {
				// QR format only
				detectorRef.current = new BD({ formats: ["qr_code"] });
			} catch (e) {
				// ignore
				detectorRef.current = null;
			}
		}

		// enumerate devices so user can pick a camera
		(async () => {
			try {
				const list = await navigator.mediaDevices.enumerateDevices();
				const videoInputs = list.filter((d) => d.kind === "videoinput");
				setDevices(videoInputs);
				if (videoInputs.length > 0)
					setSelectedDeviceId(videoInputs[0].deviceId || null);
			} catch (e) {
				// ignore
			}
		})();

		return () => {
			stopScanning();
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const startScanning = useCallback(
		async (deviceId?: string | null) => {
			setError(null);
			try {
				// stop existing stream first
				if (videoRef.current) {
					const existing = videoRef.current.srcObject as MediaStream | null;
					if (existing) existing.getTracks().forEach((t) => t.stop());
				}

				const constraints: MediaStreamConstraints = {
					audio: false,
					video: deviceId
						? { deviceId: { exact: deviceId } }
						: { facingMode: "environment" },
				};

				const stream = await navigator.mediaDevices.getUserMedia(constraints);

				if (videoRef.current) {
					videoRef.current.srcObject = stream;
					await videoRef.current.play();
				}

				// detect torch availability
				const track = stream.getVideoTracks()[0];
				try {
					const caps = track.getCapabilities?.();
					if (caps && (caps as any).torch) {
						setTorchAvailable(true);
						imageCaptureRef.current = { track };
					} else {
						setTorchAvailable(false);
						imageCaptureRef.current = null;
					}
				} catch (e) {
					setTorchAvailable(false);
					imageCaptureRef.current = null;
				}

				setScanning(true);
				rafRef.current = null;
				tick();
			} catch (err: any) {
				setError(err?.message || String(err));
			}
		},
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[]
	);

	const stopScanning = () => {
		if (rafRef.current) {
			cancelAnimationFrame(rafRef.current);
			rafRef.current = null;
		}
		if (videoRef.current) {
			const s = videoRef.current.srcObject as MediaStream | null;
			if (s) {
				s.getTracks().forEach((t) => t.stop());
			}
			videoRef.current.pause();
			videoRef.current.srcObject = null;
		}
		// reset torch state
		setTorchOn(false);
		setScanning(false);
	};

	const tick = async () => {
		const video = videoRef.current;
		const canvas = canvasRef.current;
		if (!video || !canvas) return;

		const width = video.videoWidth;
		const height = video.videoHeight;
		if (width === 0 || height === 0) {
			rafRef.current = requestAnimationFrame(tick);
			return;
		}

		canvas.width = width;
		canvas.height = height;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		ctx.drawImage(video, 0, 0, width, height);

		// Try BarcodeDetector first
		try {
			const detector = detectorRef.current;
			if (detector) {
				// Pass the canvas element directly
				const barcodes = await detector.detect(canvas as any);
				if (barcodes && barcodes.length > 0) {
					const raw = barcodes[0].rawValue || barcodes[0].raw?.value || "";
					handleResult(raw);
				}
			} else {
				// Fallback to jsQR
				const imageData = ctx.getImageData(0, 0, width, height);
				const code = jsQR(imageData.data, width, height);
				if (code && code.data) {
					handleResult(code.data);
				}
			}
		} catch (e) {
			// ignore per-frame errors
		}

		rafRef.current = requestAnimationFrame(tick);
	};

	const handleResult = (text: string) => {
		if (!text) return;
		setLastResult(text);

		const now = new Date().toISOString();

		setHistory((prev) => {
			// check for existing entry (exact match)
			const idx = prev.findIndex((e) => e.text === text);
			if (idx >= 0) {
				const updated = [...prev];
				const existing = updated[idx];
				const bumped: HistoryEntry = {
					...existing,
					count: existing.count + 1,
					lastSeen: now,
				};
				// move to front
				updated.splice(idx, 1);
				return [bumped, ...updated].slice(0, 200);
			}

			const entry: HistoryEntry = {
				text,
				count: 1,
				firstSeen: now,
				lastSeen: now,
			};
			return [entry, ...prev].slice(0, 200);
		});

		if (singleScan) {
			stopScanning();
		}
		// parse and post to server to save
		try {
			const parsedRes = parseQrText(text);
			setParsed(parsedRes.fields ?? null);
			setValidationErrors(parsedRes.errors ?? []);

			// post and check server response for duplicate metadata
			(async () => {
				try {
					const resp = await fetch("/api/scans", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							text,
							parsed: parsedRes.fields,
							firstSeen: new Date().toISOString(),
							lastSeen: new Date().toISOString(),
							count: 1,
						}),
					});
					const j = await resp.json().catch(() => ({}));
					if (j && j.wasDuplicate) {
						// show a toast notification about duplicate use
						const prev = j.lastSeen
							? new Date(j.lastSeen).toLocaleString()
							: "unknown";
						setToastMessage(
							`Duplicate scan — previously used at ${prev} (count: ${j.count})`
						);
						// fetch detailed uses from the list endpoint (small list expected)
						try {
							const listResp = await fetch(`/api/scans/list`);
							const listJson = await listResp.json().catch(() => []);
							if (Array.isArray(listJson)) {
								// try to find by hash (if parsed hash) or by exact text
								const key =
									(parsedRes.fields &&
										(parsedRes.fields.hash || parsedRes.fields.hash)) ||
									null;
								let found = null as any;
								if (key)
									found = listJson.find(
										(r: any) =>
											(r.parsed && r.parsed.hash === key) ||
											r.key === key ||
											r.text === text
									);
								if (!found) found = listJson.find((r: any) => r.text === text);
								if (found && Array.isArray(found.uses)) {
									setLastUses(
										found.uses.map((u: any) => new Date(u.at).toLocaleString())
									);
								} else {
									setLastUses(null);
								}
							}
						} catch (e) {
							// ignore list fetch errors
						}
					}
				} catch (e) {
					// ignore network errors
				}
			})();
		} catch (e) {
			// ignore parsing/post errors
		}
	};

	const clearHistory = () => setHistory([]);

	const copyResult = async (t?: string) => {
		try {
			await navigator.clipboard.writeText(t || lastResult || "");
		} catch (_) {
			// fallback
		}
	};

	const openIfUrl = (t?: string) => {
		const txt = (t || lastResult || "").trim();
		try {
			const u = new URL(txt);
			window.open(u.toString(), "_blank");
		} catch (_) {
			// not a url
		}
	};

	// toggle torch/flash if available
	const toggleTorch = async () => {
		try {
			const obj = imageCaptureRef.current;
			if (!obj || !obj.track) return;
			const track = obj.track as MediaStreamTrack;
			const capabilities = track.getCapabilities?.() as any;
			if (!capabilities || !capabilities.torch) return;
			// applyConstraints typing doesn't include torch — cast to any
			await (track as any).applyConstraints({
				advanced: [{ torch: !torchOn }],
			});
			setTorchOn((v) => !v);
		} catch (e) {
			// ignore
		}
	};

	// keyboard shortcuts
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.code === "Space") {
				e.preventDefault();
				if (scanning) stopScanning();
				else startScanning(selectedDeviceId);
			}
			if (e.key === "c") copyResult();
			if (e.key === "o") openIfUrl();
			if (e.key === "s") setSingleScan((v) => !v);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [scanning, selectedDeviceId]);

	// restart stream when device selected while scanning
	useEffect(() => {
		if (scanning) {
			startScanning(selectedDeviceId);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [selectedDeviceId]);

	// parse and validate lastResult whenever it changes
	useEffect(() => {
		if (!lastResult) {
			setParsed(null);
			setValidationErrors([]);
			return;
		}
		const res = parseQrText(lastResult);
		setParsed(res.fields ?? null);
		setValidationErrors(res.errors ?? []);
	}, [lastResult]);

	return (
		<div
			className="min-h-screen flex flex-col items-center justify-start gap-6 p-6"
			style={{
				background: "linear-gradient(var(--background), var(--panel-bg))",
			}}
		>
			<div className="w-full flex items-center justify-between">
				<h1 className="text-2xl font-semibold">QR Scanner</h1>
				<button
					className="px-3 py-1 rounded border bg-white/80 hover:bg-gray-100"
					onClick={toggleTheme}
					title="Toggle light/dark theme"
				>
					{theme === "dark" ? "🌙 Dark" : "☀️ Light"}
				</button>
			</div>

			<div className="w-full max-w-3xl grid grid-cols-1 md:grid-cols-2 gap-4">
				<div className="flex flex-col gap-3">
					<div className="bg-muted rounded overflow-hidden aspect-video flex items-center justify-center relative shadow-sm border-default">
						<video
							ref={videoRef}
							className="w-full h-full object-cover"
							muted
							playsInline
						/>
						<canvas ref={canvasRef} style={{ display: "none" }} />

						{/* visual overlay to help user aim */}
						<div className="pointer-events-none absolute inset-0 flex items-center justify-center">
							<div className="w-2/3 h-2/3 border-2 rounded-md shadow-sm bg-panel-quiet border-default"></div>
						</div>
					</div>

					<div className="flex flex-wrap items-center gap-2">
						{/* Camera selector */}
						{devices.length > 0 && (
							<select
								value={selectedDeviceId ?? ""}
								onChange={(e) => setSelectedDeviceId(e.target.value || null)}
								className="px-2 py-1 border rounded"
							>
								{devices.map((d) => (
									<option key={d.deviceId} value={d.deviceId}>
										{d.label || `Camera ${d.deviceId.slice(-4)}`}
									</option>
								))}
							</select>
						)}

						{/* Single-scan toggle */}
						<button
							className={`px-2 py-1 rounded border ${
								singleScan ? "bg-yellow-100" : "bg-panel"
							} border-default`}
							onClick={() => setSingleScan((v) => !v)}
							title="Toggle single-scan mode (press 's')"
						>
							{singleScan ? "Single" : "Continuous"}
						</button>

						{/* Torch toggle if supported */}
						{torchAvailable && (
							<button
								className={`px-2 py-1 rounded border ${
									torchOn ? "bg-yellow-200" : "bg-panel"
								} border-default`}
								onClick={toggleTorch}
								title="Toggle torch/flash"
							>
								{torchOn ? "Torch On" : "Torch Off"}
							</button>
						)}

						{/* Start / Stop */}
						{!scanning ? (
							<button
								className="px-4 py-2 bg-green-600 text-white rounded"
								onClick={() => startScanning(selectedDeviceId)}
							>
								Start
							</button>
						) : (
							<button
								className="px-4 py-2 bg-red-600 text-white rounded"
								onClick={stopScanning}
							>
								Stop
							</button>
						)}

						<button
							className="px-4 py-2 bg-muted rounded"
							onClick={() => copyResult()}
							disabled={!lastResult}
						>
							Copy
						</button>

						<button
							className="px-4 py-2 bg-muted rounded"
							onClick={() => openIfUrl()}
							disabled={!lastResult}
						>
							Open
						</button>
					</div>

					{error && <div className="text-sm text-red-600">{error}</div>}

					{/* Toast component (auto-hiding) */}
					<Toast message={toastMessage} onClose={() => setToastMessage("")} />
				</div>

				<div className="flex flex-col gap-3">
					<div className="p-3 border rounded min-h-[12rem] bg-panel border-default">
						<div className="flex items-center justify-between">
							<h2 className="font-medium">Last result</h2>
							<div>
								{lastResult ? (
									<span
										className={`px-2 py-1 text-xs rounded ${
											validationErrors.length === 0
												? "bg-green-100 text-green-800"
												: "bg-red-100 text-red-800"
										}`}
									>
										{validationErrors.length === 0 ? "Valid" : "Invalid"}
									</span>
								) : null}
							</div>
						</div>

						<div className="mt-2 text-sm break-words">
							{!lastResult ? (
								<em>No result yet</em>
							) : (
								<div className="space-y-2">
									<div className="font-mono text-xs bg-panel-quiet p-2 rounded">
										{lastResult}
									</div>
									{parsed ? (
										<div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
											<div>
												<div className="text-xs text-gray-600">ID</div>
												<div className="font-medium">{parsed.id}</div>
											</div>
											<div>
												<div className="text-xs text-gray-600">From</div>
												<div className="font-medium">{parsed.from}</div>
											</div>
											<div>
												<div className="text-xs text-gray-600">To</div>
												<div className="font-medium">{parsed.to}</div>
											</div>
											<div>
												<div className="text-xs text-gray-600">Action</div>
												<div className="font-medium">{parsed.action}</div>
											</div>
											<div className="sm:col-span-2">
												<div className="text-xs text-gray-600">Flags</div>
												<div className="font-mono text-sm">
													{parsed.flag1} : {parsed.flag2}
												</div>
											</div>
											<div className="sm:col-span-2">
												<div className="text-xs text-gray-600">Codes</div>
												<div className="text-sm break-words">
													{(parsed.codes || []).join(":")}
												</div>
											</div>
											<div className="sm:col-span-2">
												<div className="text-xs text-gray-600">Signature</div>
												<div className="font-mono text-sm break-words">
													{parsed.signature}
												</div>
											</div>
										</div>
									) : null}
									{validationErrors.length > 0 && (
										<div className="mt-2 text-sm text-red-700">
											<ul className="list-disc pl-5">
												{validationErrors.map((e, i) => (
													<li key={i}>{e}</li>
												))}
											</ul>
										</div>
									)}
									{lastUses && (
										<div className="mt-3 text-sm">
											<div className="text-xs text-gray-600">Recent uses</div>
											<ul className="list-disc pl-5">
												{lastUses.map((u, i) => (
													<li key={i}>{u}</li>
												))}
											</ul>
										</div>
									)}
								</div>
							)}
						</div>
					</div>

					<div className="p-3 border rounded bg-panel flex-1 border-default">
						<div className="flex items-center justify-between mb-2">
							<h3 className="font-medium">History</h3>
							<div className="flex gap-2">
								<button
									className="px-2 py-1 text-sm bg-muted rounded"
									onClick={clearHistory}
								>
									Clear
								</button>
							</div>
						</div>

						<ul className="text-sm pl-0 max-h-56 overflow-auto">
							{history.length === 0 && (
								<li className="text-muted list-none">No scans yet</li>
							)}
							{history.map((entry, i) => (
								<li key={i} className="mb-2 break-words list-none">
									<div className="flex items-start justify-between gap-2">
										<div className="flex-1">
											<div className="flex items-center gap-2">
												<span className="font-mono text-sm break-words">
													{entry.text}
												</span>
												{entry.count > 1 && (
													<span className="text-xs px-2 py-1 bg-yellow-100 text-yellow-800 rounded">
														Used {entry.count}×
													</span>
												)}
											</div>
											<div className="text-xs text-gray-500 mt-1">
												First: {new Date(entry.firstSeen).toLocaleString()} •
												Last: {new Date(entry.lastSeen).toLocaleString()}
											</div>
										</div>
										<div className="flex gap-1">
											<button
												className="text-xs px-2 py-1 bg-muted rounded"
												onClick={() => copyResult(entry.text)}
											>
												Copy
											</button>
											<button
												className="text-xs px-2 py-1 bg-muted rounded"
												onClick={() => openIfUrl(entry.text)}
											>
												Open
											</button>
										</div>
									</div>
								</li>
							))}
						</ul>
					</div>
				</div>
			</div>

			<div className="text-xs text-gray-500 mt-4">
				Uses the browser BarcodeDetector API with a jsQR fallback.
			</div>
		</div>
	);
}
