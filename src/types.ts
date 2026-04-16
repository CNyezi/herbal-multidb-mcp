export type DbType = "mysql" | "postgres" | "redis" | "mongo";

export interface ConnectionConfig {
  type: DbType;
  host: string;
  port: number;
  database?: string;
  user?: string;
  password?: string;
  inherit?: string; // inherit from another connection in same project
}

export interface ProjectConfig {
  description?: string;
  workspaces: string[]; // glob patterns for CWD matching
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
