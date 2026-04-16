import { Redis } from "ioredis";
import type { ConnectionConfig, QueryResult } from "../types.js";

let clients = new Map<string, Redis>();

function getClient(key: string, config: ConnectionConfig): Redis {
  if (!clients.has(key)) {
    clients.set(key, new Redis({
      host: config.host,
      port: config.port,
      password: config.password,
      db: config.database ? parseInt(config.database, 10) : 0,
      connectTimeout: 5000,
      lazyConnect: true,
    }));
  }
  return clients.get(key)!;
}

const ALLOWED_COMMANDS = new Set([
  "get", "mget", "hget", "hgetall", "hmget", "hkeys", "hvals", "hlen",
  "lrange", "llen", "scard", "smembers", "sismember",
  "zrange", "zrangebyscore", "zcard", "zscore",
  "keys", "type", "ttl", "pttl", "exists", "dbsize", "info", "scan",
]);

export async function queryRedis(key: string, config: ConnectionConfig, command: string, args: string[]): Promise<QueryResult> {
  const cmd = command.toLowerCase();
  if (!ALLOWED_COMMANDS.has(cmd)) {
    throw new Error(`Redis command "${command}" is not allowed. Only read commands are permitted.`);
  }
  const client = getClient(key, config);
  await client.connect().catch(() => {});
  const result = await (client as any)[cmd](...args);

  if (result === null || result === undefined) {
    return { columns: ["value"], rows: [{ value: null }], rowCount: 1 };
  }
  if (typeof result === "object" && !Array.isArray(result)) {
    const rows = Object.entries(result).map(([k, v]) => ({ key: k, value: v }));
    return { columns: ["key", "value"], rows, rowCount: rows.length };
  }
  if (Array.isArray(result)) {
    const rows = result.map((v, i) => ({ index: i, value: v }));
    return { columns: ["index", "value"], rows, rowCount: rows.length };
  }
  return { columns: ["value"], rows: [{ value: result }], rowCount: 1 };
}

export async function closeRedisClients(): Promise<void> {
  for (const client of clients.values()) {
    client.disconnect();
  }
  clients = new Map();
}
