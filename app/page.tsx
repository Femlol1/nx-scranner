"use client";

import jsQR from "jsqr";
import { useEffect, useRef, useState } from "react";

export default function Home() {
	const videoRef = useRef<HTMLVideoElement | null>(null);
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const rafRef = useRef<number | null>(null);
	const detectorRef = useRef<any>(null);
	const [scanning, setScanning] = useState(false);
	const [lastResult, setLastResult] = useState<string | null>(null);
	const [history, setHistory] = useState<string[]>([]);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
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

		return () => {
			stopScanning();
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const startScanning = async () => {
		setError(null);
		try {
			const stream = await navigator.mediaDevices.getUserMedia({
				video: { facingMode: "environment" },
				audio: false,
			});

			if (videoRef.current) {
				videoRef.current.srcObject = stream;
				await videoRef.current.play();
			}

			setScanning(true);
			tick();
		} catch (err: any) {
			setError(err?.message || String(err));
		}
	};

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
		setHistory((h) => (h[0] === text ? h : [text, ...h].slice(0, 20)));
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

	return (
		<div className="min-h-screen flex flex-col items-center justify-start gap-6 p-6">
			<h1 className="text-2xl font-semibold">QR Scanner</h1>

			<div className="w-full max-w-3xl grid grid-cols-1 md:grid-cols-2 gap-4">
				<div className="flex flex-col gap-3">
					<div className="bg-black/5 rounded overflow-hidden aspect-video flex items-center justify-center">
						<video
							ref={videoRef}
							className="w-full h-full object-cover"
							muted
							playsInline
						/>
						<canvas ref={canvasRef} style={{ display: "none" }} />
					</div>

					<div className="flex gap-2">
						{!scanning ? (
							<button
								className="px-4 py-2 bg-green-600 text-white rounded"
								onClick={startScanning}
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
							className="px-4 py-2 bg-gray-200 rounded"
							onClick={() => copyResult()}
							disabled={!lastResult}
						>
							Copy
						</button>

						<button
							className="px-4 py-2 bg-gray-200 rounded"
							onClick={() => openIfUrl()}
							disabled={!lastResult}
						>
							Open
						</button>
					</div>

					{error && <div className="text-sm text-red-600">{error}</div>}
				</div>

				<div className="flex flex-col gap-3">
					<div className="p-3 border rounded min-h-[12rem] bg-white">
						<h2 className="font-medium">Last result</h2>
						<div className="mt-2 text-sm break-words">
							{lastResult ?? <em>No result yet</em>}
						</div>
					</div>

					<div className="p-3 border rounded bg-white flex-1">
						<div className="flex items-center justify-between mb-2">
							<h3 className="font-medium">History</h3>
							<div className="flex gap-2">
								<button
									className="px-2 py-1 text-sm bg-gray-100 rounded"
									onClick={clearHistory}
								>
									Clear
								</button>
							</div>
						</div>

						<ul className="text-sm list-disc pl-5 max-h-56 overflow-auto">
							{history.length === 0 && (
								<li className="text-muted">No scans yet</li>
							)}
							{history.map((h, i) => (
								<li key={i} className="mb-1 break-words">
									<div className="flex items-start justify-between gap-2">
										<div className="flex-1">{h}</div>
										<div className="flex gap-1">
											<button
												className="text-xs px-2 py-1 bg-gray-100 rounded"
												onClick={() => copyResult(h)}
											>
												Copy
											</button>
											<button
												className="text-xs px-2 py-1 bg-gray-100 rounded"
												onClick={() => openIfUrl(h)}
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
