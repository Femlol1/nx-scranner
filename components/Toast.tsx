"use client";

import { useEffect } from "react";

export default function Toast({
	message,
	onClose,
}: {
	message: string;
	onClose: () => void;
}) {
	useEffect(() => {
		const t = setTimeout(onClose, 5000);
		return () => clearTimeout(t);
	}, [onClose]);

	if (!message) return null;
	return (
		<div className="fixed bottom-6 right-6 max-w-sm bg-panel border-default text-sm p-3 rounded shadow-lg">
			<div>{message}</div>
			<div className="text-xs text-gray-500 mt-1">(auto hides)</div>
		</div>
	);
}
