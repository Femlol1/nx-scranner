"use client";

import jsQR from "jsqr";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

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
	const [parsedKind, setParsedKind] = useState<string | null>(null);
	const [validationErrors, setValidationErrors] = useState<string[]>([]);
	const [lastUses, setLastUses] = useState<string[] | null>(null);
	const [pulse, setPulse] = useState(false);
	const pulseTimerRef = useRef<number | null>(null);

	// helper to format QIT DDMMYYHHMM into a readable date
	const formatQITDate = (s?: string | null) => {
		try {
			if (!s) return "-";
			// support 10-digit DDMMYYHHMM and 6-digit DDMMYY (00:00 assumed)
			if (/^[0-9]{10}$/.test(s)) {
				const dd = Number(s.slice(0, 2));
				const mm = Number(s.slice(2, 4));
				const yy = Number(s.slice(4, 6));
				const hh = Number(s.slice(6, 8));
				const min = Number(s.slice(8, 10));
				const d = new Date(2000 + yy, mm - 1, dd, hh, min);
				if (isNaN(d.getTime())) return s;
				return d.toLocaleString();
			}
			if (/^[0-9]{6}$/.test(s)) {
				const dd = Number(s.slice(0, 2));
				const mm = Number(s.slice(2, 4));
				const yy = Number(s.slice(4, 6));
				const d = new Date(2000 + yy, mm - 1, dd, 0, 0);
				if (isNaN(d.getTime())) return s;
				return d.toLocaleDateString();
			}
			return s;
		} catch {
			return s || "-";
		}
	};

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

		// QIT/QCK (extended) format detection (supports adults;children combined and optional RRD)
		if (trimmed.startsWith("QIT:") || trimmed.startsWith("QCK:")) {
			const kindLabel = trimmed.startsWith("QCK:") ? "QCK" : "QIT";
			// robustly locate the qcode and unique hash by first finding the separator '::#:::#:'
			const sep = "::#:::#:";
			const sepIdxAbs = trimmed.indexOf(sep);
			if (sepIdxAbs === -1) {
				errors.push("missing QCODE separator '::#:::#:'");
				return { raw, kind: kindLabel, fields: null, errors };
			}
			const preSep = trimmed.slice(0, sepIdxAbs);
			const postSep = trimmed.slice(sepIdxAbs + sep.length);
			const lastColon = preSep.lastIndexOf(":");
			if (lastColon === -1) {
				errors.push("malformed qcode section");
				return { raw, kind: kindLabel, fields: null, errors };
			}
			const prefix = preSep.slice(0, lastColon);
			const qcodePart = preSep
				.slice(lastColon + 1)
				.replace(/:^|:$/g, "")
				.trim();
			const unique = postSep.replace(/:$/g, "").trim();

			const rawTokens = prefix.split(":").map((t) => t.trim());
			// dynamic mapping: first token is kind (QIT/QCK)
			const tokens = rawTokens.slice(1); // drop prefix token
			let flight: string | null = null;
			let rrdl: string | null = null;
			let type: string | null = null;
			let fare: string | null = null;
			let purchase: string | null = null;
			let adults: string | null = null;
			let children: string | null = null;
			let departTok: string | null = null;
			let retTok: string | null = null;

			// helpers
			const isType = (v: string) => /^(SINGLE|RETURN)$/i.test(v);
			const isFare = (v: string) => /^[A-Z]{3,4}$/.test(v);
			const isDateTime = (v: string) =>
				/^[0-9]{10}$/.test(v) || /^[0-9]{6}$/.test(v);
			const isAdultsChildrenCombined = (v: string) => /^[0-9]+;[0-9]+$/.test(v);
			const isRRD = (v: string) => /^RRD[A-Z0-9]+$/i.test(v);

			let idx = 0;
			// flight always first
			flight = tokens[idx++] || null;
			// optional RRD
			if (tokens[idx] && isRRD(tokens[idx])) {
				rrdl = tokens[idx++];
			}
			// type
			if (tokens[idx] && isType(tokens[idx])) {
				type = tokens[idx++].toUpperCase();
			}
			// fare
			if (tokens[idx] && isFare(tokens[idx])) {
				fare = tokens[idx++];
			}
			// purchase datetime
			if (tokens[idx] && isDateTime(tokens[idx])) {
				purchase = tokens[idx++];
			}
			// adults/children either combined or separate
			if (tokens[idx] && isAdultsChildrenCombined(tokens[idx])) {
				const [a, c] = tokens[idx++].split(";");
				adults = a;
				children = c;
			} else {
				if (tokens[idx] && /^[0-9]+$/.test(tokens[idx])) adults = tokens[idx++];
				if (tokens[idx] && /^[0-9]+$/.test(tokens[idx]))
					children = tokens[idx++];
			}
			// depart datetime
			if (tokens[idx] && isDateTime(tokens[idx])) {
				departTok = tokens[idx++];
			}
			// return datetime
			if (tokens[idx] && isDateTime(tokens[idx])) {
				retTok = tokens[idx++];
			}

			// validations
			const flightNorm = (flight || "").replace(/\s+/g, "");
			if (!flightNorm || !/^[A-Za-z0-9]+$/.test(flightNorm))
				errors.push("flight: invalid code");
			if (rrdl && !/^RRD[A-Z0-9]+$/.test(rrdl.toUpperCase()))
				errors.push("rrd: invalid RRD reference code");
			if (!type || !(type === "SINGLE" || type === "RETURN"))
				errors.push("type: must be SINGLE or RETURN");
			if (!fare || !/^[A-Z]{3,4}$/.test(fare))
				errors.push("fare: expected CST/CFL/CFLL-like code");

			const parseDateTime = (s: string | null) => {
				if (!s) return null;
				// Accept 10-digit DDMMYYHHMM or 6-digit DDMMYY (00:00 assumed)
				if (!/^[0-9]{10}$/.test(s) && !/^[0-9]{6}$/.test(s)) return null;
				const dd = Number(s.slice(0, 2));
				const mm = Number(s.slice(2, 4));
				const yy = Number(s.slice(4, 6));
				const hh = s.length === 10 ? Number(s.slice(6, 8)) : 0;
				const min = s.length === 10 ? Number(s.slice(8, 10)) : 0;
				if (dd < 1 || dd > 31) return null;
				if (mm < 1 || mm > 12) return null;
				if (hh < 0 || hh > 23) return null;
				if (min < 0 || min > 59) return null;
				const year = 2000 + yy;
				const d = new Date(year, mm - 1, dd, hh, min);
				if (isNaN(d.getTime())) return null;
				return d;
			};

			const purchaseDt = purchase ? parseDateTime(purchase) : null;
			const departDt = departTok ? parseDateTime(departTok) : null;
			const returnDt = retTok ? parseDateTime(retTok) : null;
			if (!purchaseDt) errors.push("purchase: invalid date");
			if (!departDt) errors.push("depart: invalid date");
			if (purchaseDt && departDt && purchaseDt > departDt)
				errors.push("purchase: must not be after depart");
			if (type === "SINGLE" && retTok) {
				errors.push("return must be empty for SINGLE tickets");
			}
			if (type === "RETURN") {
				if (!returnDt) {
					errors.push("return: invalid or missing date for RETURN ticket");
				} else if (departDt && returnDt < departDt) {
					errors.push("return: must be after or equal to depart");
				}
			}

			// Proximity rule (still applies): depart must not be >2 days in future
			if (departDt) {
				const now = new Date();
				const msDiff = departDt.getTime() - now.getTime();
				const twoDaysMs = 2 * 24 * 60 * 60 * 1000;
				if (msDiff > twoDaysMs)
					errors.push("depart: more than 2 days away from now");
			}

			// pax validation
			if (adults && !/^[0-9]+$/.test(adults))
				errors.push("adults: must be integer >= 0");
			if (children && !/^[0-9]+$/.test(children))
				errors.push("children: must be integer >= 0");

			if (!/^[0-9a-fA-F]{16,32}$/.test(unique || ""))
				errors.push("hash: invalid hex id");
			if (!/^Q[A-Za-z0-9]+$/.test(qcodePart || ""))
				errors.push("qcode: invalid format");

			// OPEN RETURN relaxation: if RETURN ticket and return date is in the future, ignore missing/invalid depart errors
			if (type === "RETURN" && returnDt) {
				const now = new Date();
				if (returnDt.getTime() >= now.getTime()) {
					for (let i = errors.length - 1; i >= 0; i--) {
						if (errors[i].startsWith("depart:")) errors.splice(i, 1);
					}
				}
			}

			const nAdults = adults ? Number(adults) : null;
			const nChildren = children ? Number(children) : null;
			const fields: any = {
				flight,
				rrdl,
				type,
				fare,
				purchase: purchase ?? null,
				depart: departTok ?? null,
				return: retTok ?? null,
				adults: nAdults !== null && !Number.isNaN(nAdults) ? nAdults : null,
				children:
					nChildren !== null && !Number.isNaN(nChildren) ? nChildren : null,
				qcode: qcodePart ?? null,
				hash: unique ?? null,
			};

			return { raw, kind: kindLabel, fields, errors };
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
		// fieldsArr: [ticketNo, depart, return?, type, adults, children, fare, coachCard?, ...]
		const ticketNo = fieldsArr[0] ?? null;
		const depart = fieldsArr[1] ?? null;
		const ret = fieldsArr[2] ?? null;
		const type = (fieldsArr[3] ?? "").toLowerCase();
		const adults = fieldsArr[4] ?? null;
		const children = fieldsArr[5] ?? null;
		const fare = fieldsArr[6] ?? null;
		const coachCard = fieldsArr[7] ?? null;

		// bus refs: split by ':' and filter 4-letter codes
		const refs = (refsPart || "")
			.split(":")
			.filter((s) => !!s)
			.map((s) => s.trim())
			.filter(Boolean);

		const hash = (hashPart || "").replace(/:$/g, "");

		// validations
		// ticketNo rule: any 8-character alphanumeric (does not need to start with EU)
		if (!/^[A-Za-z0-9]{8}$/.test((ticketNo || "").trim()))
			errors.push("ticketNo: must be 8 letters/numbers");

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

		// Short ticket rule: valid if either depart is today OR (type===return and return is today)
		try {
			const now = new Date();
			const dd = String(now.getDate()).padStart(2, "0");
			const mm = String(now.getMonth() + 1).padStart(2, "0");
			const todayDDMM = dd + mm;
			const isReturnType = type === "return";
			const isDepartToday = depart === todayDDMM;
			const isReturnToday = (ret && ret === todayDDMM) || false;
			if (!(isDepartToday || (isReturnType && isReturnToday))) {
				// neither depart nor (return when return ticket) match today
				errors.push("date: ticket not valid for today");
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

		// optional coach card number (alphanumeric 6-12)
		if (coachCard && !/^[A-Za-z0-9]{6,12}$/.test(coachCard)) {
			errors.push("coachCard: invalid format");
		}

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
			coachCard: coachCard && coachCard !== "" ? coachCard : null,
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
				try {
					toast.info("Camera started");
				} catch {}
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
		try {
			toast.info("Camera stopped");
		} catch {}
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
			setParsedKind(parsedRes.kind ?? null);
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
						const prev = j.lastSeen
							? new Date(j.lastSeen).toLocaleString()
							: "unknown";
						toast.warning(
							`Duplicate scan — previously used at ${prev} (count: ${j.count})`
						);
						// use recentUses directly from response (already last 10)
						if (Array.isArray(j.recentUses) && j.recentUses.length > 0) {
							setLastUses(
								j.recentUses.map((u: any) => new Date(u.at).toLocaleString())
							);
						} else {
							setLastUses(null);
						}
					} else {
						setLastUses(null);
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
			setTorchOn((v) => {
				const next = !v;
				try {
					toast.info(next ? "Torch on" : "Torch off");
				} catch {}
				return next;
			});
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
			if (e.key === "s")
				setSingleScan((v) => {
					const next = !v;
					try {
						toast.info(next ? "Single-scan mode" : "Continuous mode");
					} catch {}
					return next;
				});
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
			setParsedKind(null);
			setValidationErrors([]);
			return;
		}
		const res = parseQrText(lastResult);
		setParsed(res.fields ?? null);
		setParsedKind(res.kind ?? null);
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
								onChange={(e) => {
									setSelectedDeviceId(e.target.value || null);
									try {
										toast.info("Camera switched");
									} catch {}
								}}
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
							className={`btn ${singleScan ? "bg-yellow-100" : ""}`}
							onClick={() =>
								setSingleScan((v) => {
									const next = !v;
									try {
										toast.info(next ? "Single-scan mode" : "Continuous mode");
									} catch {}
									return next;
								})
							}
							title="Toggle single-scan mode (press 's')"
						>
							{singleScan ? "Single" : "Continuous"}
						</button>

						{/* Torch toggle if supported */}
						{torchAvailable && (
							<button
								className={`btn ${torchOn ? "bg-yellow-200" : ""}`}
								onClick={toggleTorch}
								title="Toggle torch/flash"
							>
								{torchOn ? "Torch On" : "Torch Off"}
							</button>
						)}

						{/* Start / Stop */}
						{!scanning ? (
							<button
								className="btn btn-primary"
								onClick={() => startScanning(selectedDeviceId)}
							>
								Start
							</button>
						) : (
							<button className="btn btn-danger" onClick={stopScanning}>
								Stop
							</button>
						)}

						<button
							className="btn btn-muted"
							onClick={() => copyResult()}
							disabled={!lastResult}
						>
							Copy
						</button>

						<button
							className="btn btn-muted"
							onClick={() => openIfUrl()}
							disabled={!lastResult}
						>
							Open
						</button>
					</div>

					{error && <div className="text-sm text-red-600">{error}</div>}

					{/* Notifications handled by Sonner <Toaster /> in layout */}
				</div>

				<div className="flex flex-col gap-3">
					<div
						className={`p-3 border rounded min-h-[12rem] transition-colors duration-200 relative overflow-hidden ${
							lastResult
								? validationErrors.length === 0
									? "bg-green-50 border-green-300"
									: "bg-red-50 border-red-300"
								: "bg-panel border-default"
						}`}
					>
						{/* Pulsing overlay when a new valid or invalid result is shown */}
						{lastResult && (
							<div
								className={`absolute inset-0 pointer-events-none transition-opacity duration-700 ${
									validationErrors.length === 0
										? "animate-[pulseGlow_2s_ease-in-out_infinite] bg-green-200/20"
										: "animate-[pulseGlow_2s_ease-in-out_infinite] bg-red-200/20"
								}`}
							/>
						)}
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
										<div className="mt-2 space-y-4">
											{/* Format label */}
											<div className="flex items-center gap-2 text-xs uppercase tracking-wide text-gray-500">
												<span className="px-2 py-0.5 rounded bg-muted">
													Format
												</span>
												<span className="font-mono">{parsedKind || "?"}</span>
											</div>

											{/* High-level identifiers */}
											<div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
												<div className="p-2 rounded bg-panel-quiet">
													<div className="text-[10px] font-semibold text-gray-600">
														ID / Ticket
													</div>
													<div className="font-mono text-sm break-words">
														{parsed.ticketNo ||
															parsed.flight ||
															parsed.id ||
															"-"}
													</div>
												</div>
												<div className="p-2 rounded bg-panel-quiet">
													<div className="text-[10px] font-semibold text-gray-600">
														Type
													</div>
													<div className="text-sm">{parsed.type || "-"}</div>
												</div>
												<div className="p-2 rounded bg-panel-quiet">
													<div className="text-[10px] font-semibold text-gray-600">
														Fare
													</div>
													<div className="text-sm">{parsed.fare || "-"}</div>
												</div>
											</div>

											{/* Date info (QIT supports purchase + depart + return) */}
											<div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
												<div className="p-2 rounded bg-panel-quiet">
													<div className="text-[10px] font-semibold text-gray-600">
														Purchase
													</div>
													<div className="text-sm break-words">
														{formatQITDate(parsed.purchase) ||
															parsed.purchase ||
															"-"}
													</div>
												</div>
												<div className="p-2 rounded bg-panel-quiet">
													<div className="text-[10px] font-semibold text-gray-600">
														Depart
													</div>
													<div className="text-sm break-words">
														{formatQITDate(parsed.depart) ||
															parsed.depart ||
															"-"}
													</div>
												</div>
												<div className="p-2 rounded bg-panel-quiet">
													<div className="text-[10px] font-semibold text-gray-600">
														Return
													</div>
													<div className="text-sm break-words">
														{formatQITDate(parsed.return) ||
															parsed.return ||
															"-"}
													</div>
												</div>
											</div>

											{/* Counts & pax */}
											<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
												<div className="p-2 rounded bg-panel-quiet">
													<div className="text-[10px] font-semibold text-gray-600">
														Adults
													</div>
													<div className="text-sm">{parsed.adults ?? "-"}</div>
												</div>
												<div className="p-2 rounded bg-panel-quiet">
													<div className="text-[10px] font-semibold text-gray-600">
														Children
													</div>
													<div className="text-sm">
														{parsed.children ?? "-"}
													</div>
												</div>
											</div>

											{/* Coach Card + Refs in one row */}
											{(parsed.refs && parsed.refs.length > 0) ||
											parsed.coachCard ? (
												<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
													{parsed.coachCard && (
														<div className="p-2 rounded bg-panel-quiet">
															<div className="text-[10px] font-semibold text-gray-600">
																Coach Card
															</div>
															<div className="font-mono text-xs break-all">
																{parsed.coachCard}
															</div>
														</div>
													)}
													{parsed.refs && parsed.refs.length > 0 && (
														<div className="p-2 rounded bg-panel-quiet">
															<div className="text-[10px] font-semibold text-gray-600">
																Refs
															</div>
															<div className="font-mono text-xs break-words">
																{parsed.refs.join(" : ")}
															</div>
														</div>
													)}
												</div>
											) : null}

											{/* Hash / signature */}
											{parsed.hash && (
												<div className="p-2 rounded bg-panel-quiet">
													<div className="text-[10px] font-semibold text-gray-600">
														Hash
													</div>
													<div className="font-mono text-xs break-all">
														{parsed.hash}
													</div>
												</div>
											)}
											{parsed.signature && (
												<div className="p-2 rounded bg-panel-quiet">
													<div className="text-[10px] font-semibold text-gray-600">
														Signature
													</div>
													<div className="font-mono text-xs break-words">
														{parsed.signature}
													</div>
												</div>
											)}
											{/* Open return explanatory note */}
											{parsedKind &&
												(parsedKind === "QIT" || parsedKind === "QCK") &&
												parsed.type === "RETURN" &&
												parsed.return &&
												(() => {
													// if depart was missing/invalid originally we removed its errors; show rationale
													const hadDepartError = validationErrors.find((e) =>
														e.startsWith("depart:")
													);
													// compute if return still in future
													const r = parsed.return;
													if (r && /^[0-9]{10}$/.test(r)) {
														const dd = Number(r.slice(0, 2));
														const mm = Number(r.slice(2, 4));
														const yy = Number(r.slice(4, 6));
														const hh = Number(r.slice(6, 8));
														const min = Number(r.slice(8, 10));
														const d = new Date(2000 + yy, mm - 1, dd, hh, min);
														if (!isNaN(d.getTime())) {
															if (d.getTime() >= Date.now()) {
																return (
																	<div className="text-[11px] text-gray-600 italic">
																		Open return: valid as long as return date
																		hasn't expired
																		{hadDepartError
																			? " (depart missing/invalid ignored)"
																			: ""}
																		.
																	</div>
																);
															}
														}
													}
													return null;
												})()}
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
								<button className="btn btn-muted" onClick={clearHistory}>
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
												className="btn btn-muted text-xs"
												onClick={() => copyResult(entry.text)}
											>
												Copy
											</button>
											<button
												className="btn btn-muted text-xs"
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
