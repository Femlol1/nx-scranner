import { NextResponse } from "next/server";
import { getClient } from "../../../lib/mongo";

export const runtime = "nodejs";

export async function GET(req: Request) {
	try {
		const client = await getClient();
		const dbName = process.env.MONGODB_DB || "nx-scanner";
		const db = client.db(dbName);
		const col = db.collection("scans");

		// Extract pagination parameters
		const url = new URL(req.url);
		const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
		const limit = Math.max(
			1,
			Math.min(500, parseInt(url.searchParams.get("limit") || "50", 10))
		);
		const skip = (page - 1) * limit;

		// list today's scans (createdAt within local day)
		const now = new Date();
		const start = new Date(now);
		start.setHours(0, 0, 0, 0);
		const end = new Date(now);
		end.setHours(23, 59, 59, 999);

		const docs = await col
			.find({ createdAt: { $gte: start, $lte: end } })
			.sort({ lastSeen: -1 })
			.skip(skip)
			.limit(limit)
			.toArray();

		return NextResponse.json({ ok: true, scans: docs, page, limit });
	} catch (e: any) {
		console.error("/api/scans/list error:", e);
		return NextResponse.json(
			{ ok: false, error: e?.message || String(e) },
			{ status: 500 }
		);
	}
}
