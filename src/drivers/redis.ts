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
      ...(config.tls ? { tls: {} } : {}),
    }));
  }
  return clients.get(key)!;
}

const READ_COMMANDS = new Set([
  // Connection / server / metadata
  "ping", "echo", "command", "dbsize", "info", "lastsave", "role", "time",

  // Generic key introspection
  "dump", "exists", "expiretime", "keys", "object", "pexpiretime", "pttl", "randomkey",
  "scan", "sort_ro", "touch", "ttl", "type",

  // Strings / bitmaps
  "bitcount", "bitpos", "get", "getbit", "getrange", "mget", "strlen", "substr",

  // Hashes
  "hexists", "hget", "hgetall", "hkeys", "hlen", "hmget", "hrandfield", "hscan", "hstrlen", "hvals",

  // Lists
  "lindex", "llen", "lpos", "lrange",

  // Sets
  "scard", "sdiff", "sinter", "sintercard", "sismember", "smembers", "smismember", "srandmember", "sscan", "sunion",

  // Sorted sets
  "zcard", "zcount", "zdiff", "zinter", "zintercard", "zlexcount", "zmscore", "zrandmember", "zrange",
  "zrangebylex", "zrangebyscore", "zrank", "zrevrange", "zrevrangebylex", "zrevrangebyscore", "zrevrank",
  "zscan", "zscore", "zunion",

  // Streams
  "xinfo", "xlen", "xrange", "xread", "xrevrange",

  // Geospatial
  "geodist", "geohash", "geopos", "georadius_ro", "georadiusbymember_ro", "geosearch",

  // Pub/Sub introspection
  "pubsub",
]);

const WRITE_COMMANDS = new Set([
  "set", "mset", "setnx", "setex", "psetex", "getset", "incr", "incrby", "incrbyfloat", "decr", "decrby", "append",
  "hset", "hsetnx", "hmset", "hdel", "hincrby", "hincrbyfloat",
  "lpush", "rpush", "lpop", "rpop", "lset", "lrem", "ltrim",
  "sadd", "srem", "spop",
  "zadd", "zrem", "zincrby",
  "del", "unlink", "expire", "expireat", "pexpire", "persist", "rename",
]);

// Always blocked — destructive operations that should not be exposed through this tool.
const DANGEROUS_COMMANDS = new Set([
  "flushdb", "flushall", "shutdown", "debug", "slaveof", "replicaof",
]);

const READ_ONLY_SUBCOMMANDS = new Map<string, Set<string>>([
  ["acl", new Set(["cat", "getuser", "help", "list", "log", "users", "whoami"])],
  ["client", new Set(["caching", "getname", "help", "id", "info", "list", "trackinginfo"])],
  ["cluster", new Set([
    "count-failure-reports", "countkeysinslot", "getkeysinslot", "help", "info", "keyslot", "links", "myid",
    "myshardid", "nodes", "replicas", "shards", "slaves", "slots",
  ])],
  ["config", new Set(["get", "help"])],
  ["function", new Set(["help", "list", "stats"])],
  ["latency", new Set(["doctor", "graph", "help", "histogram", "history", "latest"])],
  ["memory", new Set(["doctor", "help", "malloc-stats", "stats", "usage"])],
  ["module", new Set(["help", "list"])],
  ["script", new Set(["exists", "help"])],
  ["sentinel", new Set([
    "ckquorum", "get-master-addr-by-name", "help", "info-cache", "is-master-down-by-addr", "master",
    "masters", "myid", "pending-scripts", "replicas", "sentinels", "slaves",
  ])],
  ["slowlog", new Set(["get", "help", "len"])],
]);

function requireReadOnlySubcommand(command: string, args: string[]): boolean {
  const allowed = READ_ONLY_SUBCOMMANDS.get(command);
  if (!allowed) {
    return false;
  }
  const subcommand = args[0]?.toLowerCase();
  if (!subcommand || !allowed.has(subcommand)) {
    const allowedList = Array.from(allowed).sort().join(", ");
    throw new Error(
      `Redis command "${command.toUpperCase()} ${args[0] ?? ""}" is not allowed. Allowed read-only subcommands: ${allowedList}.`
    );
  }
  return true;
}

export async function queryRedis(key: string, config: ConnectionConfig, command: string, args: string[]): Promise<QueryResult> {
  const cmd = command.toLowerCase();
  const isReadOnlySubcommand = requireReadOnlySubcommand(cmd, args);

  if (DANGEROUS_COMMANDS.has(cmd)) {
    throw new Error(`Redis command "${command}" is always blocked (destructive).`);
  }

  if (!config.allowWrite && !READ_COMMANDS.has(cmd) && !isReadOnlySubcommand) {
    throw new Error(
      `Redis command "${command}" is not allowed in read-only mode. Set allowWrite: true in config to enable write commands.`
    );
  }

  if (config.allowWrite && !READ_COMMANDS.has(cmd) && !WRITE_COMMANDS.has(cmd) && !isReadOnlySubcommand) {
    throw new Error(`Redis command "${command}" is not recognized. Check the command name.`);
  }
  const client = getClient(key, config);
  await client.connect().catch(() => {});
  const result = await (client as any).call(cmd, ...args);

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
