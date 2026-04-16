import { MongoClient } from "mongodb";
import type { ConnectionConfig, QueryResult } from "../types.js";

let clients = new Map<string, MongoClient>();

function getClient(key: string, config: ConnectionConfig): MongoClient {
  if (!clients.has(key)) {
    const uri = `mongodb://${config.user ? `${config.user}:${config.password}@` : ""}${config.host}:${config.port}`;
    clients.set(key, new MongoClient(uri, { connectTimeoutMS: 5000 }));
  }
  return clients.get(key)!;
}

export async function queryMongo(
  key: string,
  config: ConnectionConfig,
  collection: string,
  filter: Record<string, unknown> = {},
  options: { limit?: number; projection?: Record<string, unknown> } = {}
): Promise<QueryResult> {
  if (!config.database) throw new Error("MongoDB requires a database name");
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(collection)) {
    throw new Error(`Invalid collection name: ${collection}`);
  }
  const client = getClient(key, config);
  await client.connect();
  const db = client.db(config.database);
  const docs = await db.collection(collection)
    .find(filter, { projection: options.projection })
    .limit(options.limit ?? 100)
    .toArray();
  const columns = docs.length > 0 ? Object.keys(docs[0]) : [];
  return { columns, rows: docs, rowCount: docs.length };
}

export async function listCollectionsMongo(key: string, config: ConnectionConfig): Promise<string[]> {
  if (!config.database) throw new Error("MongoDB requires a database name");
  const client = getClient(key, config);
  await client.connect();
  const collections = await client.db(config.database).listCollections().toArray();
  return collections.map((c) => c.name);
}

export async function closeMongoClients(): Promise<void> {
  for (const client of clients.values()) {
    await client.close();
  }
  clients = new Map();
}
