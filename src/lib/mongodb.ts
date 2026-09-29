import { MongoClient, type Db } from "mongodb";

// Reuse one client across hot reloads (dev) and warm serverless invocations (Vercel).
const globalForMongo = globalThis as unknown as {
  _mongoClientPromise?: Promise<MongoClient>;
};

export async function getDb(): Promise<Db> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not set. Copy .env.example to .env.local and fill it in.");
  }

  if (!globalForMongo._mongoClientPromise) {
    globalForMongo._mongoClientPromise = new MongoClient(uri).connect().catch((err) => {
      // Don't cache a failed connection; let the next request retry.
      globalForMongo._mongoClientPromise = undefined;
      throw err;
    });
  }

  const client = await globalForMongo._mongoClientPromise;
  return client.db(process.env.MONGODB_DB || "entitylist");
}
