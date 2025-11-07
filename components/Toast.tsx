"use client";

import { useEffect, useRef, useState } from "react";

export default function Toast({
	message,
	onClose,
	duration = 5000,
}: {
	message: string;
	onClose: () => void;
	duration?: number;
}) {
	const [visible, setVisible] = useState(false);
	const timerRef = useRef<number | null>(null);

	useEffect(() => {
		if (!message) {
			setVisible(false);
			if (timerRef.current) {
				clearTimeout(timerRef.current);
				timerRef.current = null;
			}
			return;
		}
		setVisible(true);
		if (timerRef.current) clearTimeout(timerRef.current);
		timerRef.current = window.setTimeout(() => {
			setVisible(false);
			// allow fade-out before removal
			setTimeout(onClose, 250);
		}, duration);
		return () => {
			if (timerRef.current) clearTimeout(timerRef.current);
		};
	}, [message, duration, onClose]);

	if (!visible) return null;
	return (
		<div
			role="alert"
			aria-live="assertive"
			className="fixed bottom-6 right-6 max-w-sm bg-panel border-default text-sm p-3 rounded shadow-lg animate-fadeIn"
		>
			<div className="font-medium mb-1">{message}</div>
			<button
				className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
				onClick={() => {
					setVisible(false);
					setTimeout(onClose, 100);
				}}
			>
				Close
			</button>
		</div>
	);
}
