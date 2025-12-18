"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

interface ScanResultModalProps {
	isOpen: boolean;
	onClose: () => void;
	lastResult: string | null;
	parsed: any;
	parsedKind: string | null;
	validationErrors: string[];
	lastUses: string[] | null;
	formatQITDate: (s?: string | null) => string;
}

export default function ScanResultModal({
	isOpen,
	onClose,
	lastResult,
	parsed,
	parsedKind,
	validationErrors,
	lastUses,
	formatQITDate,
}: ScanResultModalProps) {
	// Close modal on Escape key
	useEffect(() => {
		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === "Escape" && isOpen) {
				onClose();
			}
		};
		window.addEventListener("keydown", handleEscape);
		return () => window.removeEventListener("keydown", handleEscape);
	}, [isOpen, onClose]);

	if (!isOpen || typeof window === "undefined") return null;

	const isValid = validationErrors.length === 0;

	const modalContent = (
		<>
			{/* Backdrop */}
			<div
				className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9998]"
				onClick={onClose}
			/>

			{/* Modal */}
			<div
				className="fixed z-[9999] w-[90vw] max-w-3xl max-h-[85vh] overflow-auto bg-white dark:bg-gray-900 rounded-xl shadow-2xl"
				style={{
					position: "fixed",
					top: "50%",
					left: "50%",
					transform: "translate(-50%, -50%)",
				}}
			>
				{/* Header */}
				<div
					className={`sticky top-0 z-10 px-6 py-4 border-b ${
						isValid
							? "bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800"
							: "bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800"
					}`}
				>
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-3">
							{isValid ? (
								<div className="w-12 h-12 rounded-full bg-green-500 flex items-center justify-center animate-bounce">
									<svg
										className="w-7 h-7 text-white"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth={3}
											d="M5 13l4 4L19 7"
										/>
									</svg>
								</div>
							) : (
								<div className="w-12 h-12 rounded-full bg-red-500 flex items-center justify-center">
									<svg
										className="w-7 h-7 text-white"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth={3}
											d="M6 18L18 6M6 6l12 12"
										/>
									</svg>
								</div>
							)}
							<div>
								<h2 className="text-2xl font-bold">
									{isValid ? "✓ Valid Ticket" : "✗ Invalid Ticket"}
								</h2>
								<p className="text-sm text-gray-600 dark:text-gray-400">
									{isValid
										? "Ticket scanned successfully"
										: "Validation errors detected"}
								</p>
							</div>
						</div>
						<button
							onClick={onClose}
							className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
							aria-label="Close modal"
						>
							<svg
								className="w-6 h-6"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M6 18L18 6M6 6l12 12"
								/>
							</svg>
						</button>
					</div>
				</div>

				{/* Content */}
				<div className="p-6 space-y-6">
					{/* Raw QR Data */}
					<div>
						<h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2">
							QR Code Data
						</h3>
						<div className="font-mono text-xs bg-gray-100 dark:bg-gray-800 p-3 rounded break-all">
							{lastResult}
						</div>
					</div>

					{/* Parsed Fields */}
					{parsed && (
						<div>
							<div className="flex items-center gap-2 mb-3">
								<h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400">
									Ticket Details
								</h3>
								<span className="px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 text-xs font-mono">
									{parsedKind || "UNKNOWN"}
								</span>
							</div>

							{/* Primary Info */}
							<div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
								<div className="p-3 rounded bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
									<div className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
										ID / Ticket
									</div>
									<div className="font-mono text-base font-semibold break-words">
										{parsed.ticketNo || parsed.flight || parsed.id || "-"}
									</div>
								</div>
								<div className="p-3 rounded bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
									<div className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
										Type
									</div>
									<div className="text-base font-semibold">
										{parsed.type || "-"}
									</div>
								</div>
								<div className="p-3 rounded bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
									<div className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
										Fare
									</div>
									<div className="text-base font-semibold">
										{parsed.fare || "-"}
									</div>
								</div>
							</div>

							{/* Date Info */}
							<div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
								<div className="p-3 rounded bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
									<div className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
										Purchase
									</div>
									<div className="text-sm break-words">
										{formatQITDate(parsed.purchase) || parsed.purchase || "-"}
									</div>
								</div>
								<div className="p-3 rounded bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
									<div className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
										Depart
									</div>
									<div className="text-sm break-words">
										{formatQITDate(parsed.depart) || parsed.depart || "-"}
									</div>
								</div>
								<div className="p-3 rounded bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
									<div className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
										Return
									</div>
									<div className="text-sm break-words">
										{formatQITDate(parsed.return) || parsed.return || "-"}
									</div>
								</div>
							</div>

							{/* Passenger Info */}
							<div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
								<div className="p-3 rounded bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
									<div className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
										Adults
									</div>
									<div className="text-base font-semibold">
										{parsed.adults ?? "-"}
									</div>
								</div>
								<div className="p-3 rounded bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
									<div className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
										Children
									</div>
									<div className="text-base font-semibold">
										{parsed.children ?? "-"}
									</div>
								</div>
							</div>

							{/* Optional Fields */}
							{((parsed.refs && parsed.refs.length > 0) ||
								parsed.coachCard) && (
								<div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
									{parsed.coachCard && (
										<div className="p-3 rounded bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
											<div className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
												Coach Card
											</div>
											<div className="font-mono text-xs break-all">
												{parsed.coachCard}
											</div>
										</div>
									)}
									{parsed.refs && parsed.refs.length > 0 && (
										<div className="p-3 rounded bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
											<div className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
												References
											</div>
											<div className="font-mono text-xs break-words">
												{parsed.refs.join(" : ")}
											</div>
										</div>
									)}
								</div>
							)}

							{/* Hash */}
							{(parsed.hash || parsed.signature) && (
								<div className="p-3 rounded bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
									<div className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
										{parsed.hash ? "Hash" : "Signature"}
									</div>
									<div className="font-mono text-xs break-all">
										{parsed.hash || parsed.signature}
									</div>
								</div>
							)}
						</div>
					)}

					{/* Validation Errors */}
					{validationErrors.length > 0 && (
						<div className="p-4 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800">
							<h3 className="text-sm font-semibold text-red-800 dark:text-red-200 mb-2 flex items-center gap-2">
								<svg
									className="w-5 h-5"
									fill="currentColor"
									viewBox="0 0 20 20"
								>
									<path
										fillRule="evenodd"
										d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
										clipRule="evenodd"
									/>
								</svg>
								Validation Errors
							</h3>
							<ul className="list-disc pl-5 space-y-1 text-sm text-red-700 dark:text-red-300">
								{validationErrors.map((e, i) => (
									<li key={i}>{e}</li>
								))}
							</ul>
						</div>
					)}

					{/* Recent Uses (Duplicate Warning) */}
					{lastUses && lastUses.length > 0 && (
						<div className="p-4 rounded-lg bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800">
							<h3 className="text-sm font-semibold text-yellow-800 dark:text-yellow-200 mb-2 flex items-center gap-2">
								<svg
									className="w-5 h-5"
									fill="currentColor"
									viewBox="0 0 20 20"
								>
									<path
										fillRule="evenodd"
										d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
										clipRule="evenodd"
									/>
								</svg>
								⚠️ Duplicate Scan Detected
							</h3>
							<p className="text-sm text-yellow-700 dark:text-yellow-300 mb-2">
								This ticket has been scanned before:
							</p>
							<ul className="list-disc pl-5 space-y-1 text-sm text-yellow-700 dark:text-yellow-300">
								{lastUses.map((u, i) => (
									<li key={i}>{u}</li>
								))}
							</ul>
						</div>
					)}
				</div>

				{/* Footer */}
				<div className="sticky bottom-0 px-6 py-4 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
					<button
						onClick={onClose}
						className="px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-colors shadow-sm"
					>
						Continue Scanning
					</button>
				</div>
			</div>
		</>
	);

	return createPortal(modalContent, document.body);
}
