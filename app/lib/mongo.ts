import { MongoClient } from "mongodb";

declare global {
	// eslint-disable-next-line no-var
	var _mongoClientPromise: Promise<MongoClient> | undefined;
}

export const getClient = async (): Promise<MongoClient> => {
	const uri = process.env.MONGODB_URI;
	if (!uri) throw new Error("MONGODB_URI environment variable is not set");

	const g = globalThis as any;
	if (!g._mongoClientPromise) {
		const client = new MongoClient(uri);
		g._mongoClientPromise = client.connect();
	}
	return g._mongoClientPromise as Promise<MongoClient>;
};
