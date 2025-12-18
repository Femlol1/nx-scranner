import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const geistSans = Geist({
	variable: "--font-geist-sans",
	subsets: ["latin"],
});

const geistMono = Geist_Mono({
	variable: "--font-geist-mono",
	subsets: ["latin"],
});

export const metadata: Metadata = {
	title: "QR Scanner - Transit Ticket Validator",
	description:
		"Professional QR code scanner for validating transit tickets (train/bus). Scans QIT, QCK, and short format tickets with real-time validation, duplicate detection, and comprehensive reporting.",
	keywords: [
		"QR Scanner",
		"Ticket Validator",
		"Transit Tickets",
		"QR Code Reader",
		"Ticket Verification",
	],
	authors: [{ name: "Femi" }],
	creator: "Femi",
	openGraph: {
		title: "QR Scanner - Transit Ticket Validator",
		description:
			"Professional QR code scanner for validating transit tickets with real-time validation and duplicate detection.",
		type: "website",
	},
	viewport: "width=device-width, initial-scale=1",
	themeColor: [
		{ media: "(prefers-color-scheme: light)", color: "#ffffff" },
		{ media: "(prefers-color-scheme: dark)", color: "#1a1a1a" },
	],
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en">
			<body
				className={`${geistSans.variable} ${geistMono.variable} antialiased`}
			>
				{children}
				<Toaster
					position="bottom-right"
					richColors
					closeButton
					expand={false}
				/>
			</body>
		</html>
	);
}
