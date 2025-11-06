import { NextResponse } from "next/server";
import { getClient } from "../../../lib/mongo";

export const runtime = "nodejs";

export async function POST(req: Request) {
	try {
		const client = await getClient();
		const dbName = process.env.MONGODB_DB || "nx-scanner";
		const db = client.db(dbName);
		const col = db.collection("scans");

		const res = await col.deleteMany({});
		return NextResponse.json({ ok: true, deletedCount: res.deletedCount });
	} catch (e: any) {
		console.error("/api/scans/clear error:", e);
		return NextResponse.json(
			{ ok: false, error: e?.message || String(e) },
			{ status: 500 }
		);
	}
}
