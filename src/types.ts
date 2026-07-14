export type DbType = "mysql" | "postgres" | "redis" | "mongo" | "clickhouse";

export interface ConnectionConfig {
  type: DbType;
  host: string;
  port: number;
  database?: string;
  user?: string;
  password?: string;
  inherit?: string; // inherit from another connection in same project
  description?: string;
  readonly?: boolean;
  allowWrite?: boolean; // default false — set true to allow INSERT/UPDATE/DELETE etc.
  tls?: boolean; // enable TLS/in-transit encryption — honored by mysql, postgres, redis, clickhouse
  tlsRejectUnauthorized?: boolean; // default true (verified); set false to skip cert verification (e.g. managed DBs without a usable CA chain)
}

export interface ProjectConfig {
  description?: string;
  workspaces?: string[]; // optional, reserved for future use
  connections: Record<string, ConnectionConfig>;
}

export interface DbMcpConfig {
  projects: Record<string, ProjectConfig>;
}

export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
}
