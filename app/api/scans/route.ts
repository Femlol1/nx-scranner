import { MongoClient } from "mongodb";
import { NextResponse } from "next/server";

// This route uses the Node.js runtime because the MongoDB native driver
// requires network/socket support not available in the Edge runtime.
export const runtime = "nodejs";

// A tiny Mongo helper that caches the connection in globalThis to avoid
// creating many connections during hot reload / lambda cold starts.
declare global {
	// eslint-disable-next-line no-var
	var _mongoClientPromise: Promise<MongoClient> | undefined;
}

const getClient = async (): Promise<MongoClient> => {
	const uri = process.env.MONGODB_URI;
	if (!uri) throw new Error("MONGODB_URI environment variable is not set");

	// use globalThis so this works in all Node contexts
	const g = globalThis as any;
	if (!g._mongoClientPromise) {
		const client = new MongoClient(uri);
		g._mongoClientPromise = client.connect();
	}
	return g._mongoClientPromise as Promise<MongoClient>;
};

export async function POST(req: Request) {
	try {
		const body = await req.json();
		const { text, parsed, firstSeen, lastSeen, count } = body || {};

		let client: MongoClient;
		try {
			client = await getClient();
		} catch (e: any) {
			// Return a clearer error to the client when env/config is wrong
			console.error("Mongo client error:", e);
			return NextResponse.json(
				{ ok: false, error: e?.message || String(e) },
				{ status: 500 }
			);
		}

		const dbName = process.env.MONGODB_DB || "nx-scanner";
		const db = client.db(dbName);
		const col = db.collection("scans");

		// set expiresAt to end of current day (server local tz)
		const now = new Date();
		const expiresAt = new Date(now);
		expiresAt.setHours(23, 59, 59, 999);

		// choose a stable key for deduplication: prefer parsed.hash, else text
		const key = (parsed && (parsed.hash || parsed.id)) || (typeof text === "string" ? text : null);

		// Build update that increments count, sets lastSeen and parsed, and records a use timestamp
		const useAt = now;
		const filter: any = { key };
		const update: any = {
			$set: {
				text: text ?? null,
				parsed: parsed ?? null,
				lastSeen: useAt,
				expiresAt,
			},
			$setOnInsert: {
				firstSeen: useAt,
				createdAt: now,
			},
			$inc: { count: 1 },
			$push: { uses: { at: useAt } },
		};

		// ensure TTL index exists (best-effort)
		try {
			await col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
		} catch (e) {
			console.warn("Could not create TTL index on scans.expiresAt:", e);
		}

		// Perform an upsert so repeated scans update the same document
		let updated: any = null;
		try {
			const res = await col.findOneAndUpdate(filter, update, {
				upsert: true,
				returnDocument: "after",
			} as any);
			updated = res.value;
		} catch (e: any) {
			console.error("Failed to upsert scan document:", e);
			return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
		}

		// respond with duplicate metadata so clients can notify the user
		const wasDuplicate = !!updated && updated.count > 1;
		return NextResponse.json({ ok: true, wasDuplicate, count: updated?.count ?? 1, firstSeen: updated?.firstSeen, lastSeen: updated?.lastSeen });
	} catch (err: any) {
		console.error("/api/scans POST handler error:", err);
		return NextResponse.json(
			{ ok: false, error: err?.message || String(err) },
			{ status: 500 }
		);
	}
}
