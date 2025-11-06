import { NextResponse } from "next/server";
import { getClient } from "../../../lib/mongo";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const client = await getClient();
    const dbName = process.env.MONGODB_DB || "nx-scanner";
    const db = client.db(dbName);
    const col = db.collection("scans");

    // list today's scans (createdAt within local day)
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);

    const docs = await col
      .find({ createdAt: { $gte: start, $lte: end } })
      .sort({ lastSeen: -1 })
      .limit(1000)
      .toArray();

    return NextResponse.json({ ok: true, scans: docs });
  } catch (e: any) {
    console.error("/api/scans/list error:", e);
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
