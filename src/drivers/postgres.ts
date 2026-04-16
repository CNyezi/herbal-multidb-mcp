import pg from "pg";
import type { ConnectionConfig, QueryResult } from "../types.js";

let pools = new Map<string, pg.Pool>();

function getPool(key: string, config: ConnectionConfig): pg.Pool {
  if (!pools.has(key)) {
    pools.set(key, new pg.Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      max: 3,
      connectionTimeoutMillis: 5000,
    }));
  }
  return pools.get(key)!;
}

export async function queryPostgres(key: string, config: ConnectionConfig, sql: string): Promise<QueryResult> {
  const pool = getPool(key, config);
  const result = await pool.query(sql);
  return {
    columns: result.fields.map((f) => f.name),
    rows: result.rows,
    rowCount: result.rowCount ?? result.rows.length,
  };
}

export async function listTablesPostgres(key: string, config: ConnectionConfig): Promise<string[]> {
  const result = await queryPostgres(key, config,
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename"
  );
  return result.rows.map((r) => (r as { tablename: string }).tablename);
}

export async function describeTablePostgres(key: string, config: ConnectionConfig, table: string): Promise<QueryResult> {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table)) {
    throw new Error(`Invalid table name: ${table}`);
  }
  return queryPostgres(key, config,
    `SELECT column_name, data_type, is_nullable, column_default
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = '${table}'
     ORDER BY ordinal_position`
  );
}

export async function closePostgresPools(): Promise<void> {
  for (const pool of pools.values()) {
    await pool.end();
  }
  pools = new Map();
}
