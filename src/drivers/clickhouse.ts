import { createClient } from "@clickhouse/client";
import type { ClickHouseClient } from "@clickhouse/client";
import https from "node:https";
import type { ConnectionConfig, QueryResult } from "../types.js";

let clients = new Map<string, ClickHouseClient>();

function getClient(key: string, config: ConnectionConfig): ClickHouseClient {
  if (!clients.has(key)) {
    const protocol = config.tls ? "https" : "http";
    clients.set(key, createClient({
      url: `${protocol}://${config.host}:${config.port}`,
      username: config.user,
      password: config.password,
      database: config.database,
      request_timeout: 5000,
      ...(config.tls && config.tlsRejectUnauthorized === false
        ? { http_agent: new https.Agent({ rejectUnauthorized: false }) }
        : {}),
    }));
  }
  return clients.get(key)!;
}

export async function queryClickHouse(key: string, config: ConnectionConfig, sql: string): Promise<QueryResult> {
  const client = getClient(key, config);
  const resultSet = await client.query({ query: sql, format: "JSONEachRow" });
  const rows = await resultSet.json<Record<string, unknown>>();
  return {
    columns: rows.length ? Object.keys(rows[0]) : [],
    rows,
    rowCount: rows.length,
  };
}

export async function listTablesClickHouse(key: string, config: ConnectionConfig): Promise<string[]> {
  const result = await queryClickHouse(key, config, "SHOW TABLES");
  return result.rows.map((r) => Object.values(r)[0] as string);
}

export async function describeTableClickHouse(key: string, config: ConnectionConfig, table: string): Promise<QueryResult> {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table)) {
    throw new Error(`Invalid table name: ${table}`);
  }
  return queryClickHouse(key, config, `DESCRIBE TABLE \`${table}\``);
}

export async function closeClickHousePools(): Promise<void> {
  for (const client of clients.values()) {
    await client.close();
  }
  clients = new Map();
}
