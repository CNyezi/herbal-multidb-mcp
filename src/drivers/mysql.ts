import mysql from "mysql2/promise";
import type { ConnectionConfig, QueryResult } from "../types.js";

let pools = new Map<string, mysql.Pool>();

function getPool(key: string, config: ConnectionConfig): mysql.Pool {
  if (!pools.has(key)) {
    pools.set(key, mysql.createPool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      ssl: config.tls ? { rejectUnauthorized: config.tlsRejectUnauthorized ?? true } : undefined,
      connectionLimit: 3,
      connectTimeout: 5000,
    }));
  }
  return pools.get(key)!;
}

export async function queryMysql(key: string, config: ConnectionConfig, sql: string): Promise<QueryResult> {
  const pool = getPool(key, config);
  const [rows, fields] = await pool.query(sql);
  const resultRows = rows as Record<string, unknown>[];
  return {
    columns: fields ? (fields as mysql.FieldPacket[]).map((f) => f.name) : Object.keys(resultRows[0] ?? {}),
    rows: resultRows,
    rowCount: resultRows.length,
  };
}

export async function listTablesMysql(key: string, config: ConnectionConfig): Promise<string[]> {
  const result = await queryMysql(key, config, "SHOW TABLES");
  return result.rows.map((r) => Object.values(r)[0] as string);
}

export async function describeTableMysql(key: string, config: ConnectionConfig, table: string): Promise<QueryResult> {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table)) {
    throw new Error(`Invalid table name: ${table}`);
  }
  return queryMysql(key, config, `DESCRIBE \`${table}\``);
}

export async function closeMysqlPools(): Promise<void> {
  for (const pool of pools.values()) {
    await pool.end();
  }
  pools = new Map();
}
