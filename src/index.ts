#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadConfig } from "./config.js";
import { validateSql } from "./sql-guard.js";
import {
  execQuery,
  execListTables,
  execDescribeTable,
  queryRedis,
  queryMongo,
  writeMongo,
  closeAll,
} from "./connection-pool.js";
import type { MongoWriteOp } from "./connection-pool.js";
import type { DbMcpConfig, ProjectConfig, ConnectionConfig } from "./types.js";

const config: DbMcpConfig = loadConfig();

// --- helpers ---

function getProject(projectName?: string): { name: string; project: ProjectConfig } {
  const projectNames = Object.keys(config.projects);
  if (projectName) {
    const project = config.projects[projectName];
    if (!project) {
      throw new Error(
        `Project "${projectName}" not found. Available: ${projectNames.join(", ")}`
      );
    }
    return { name: projectName, project };
  }
  if (projectNames.length === 1) {
    const name = projectNames[0];
    return { name, project: config.projects[name] };
  }
  throw new Error(
    `Multiple projects configured. Please specify which one: ${projectNames.join(", ")}`
  );
}

function getConnection(
  project: ProjectConfig,
  projectName: string,
  connectionName: string
): { key: string; config: ConnectionConfig } {
  const conn = project.connections[connectionName];
  if (!conn) {
    throw new Error(
      `Connection "${connectionName}" not found in project "${projectName}". Available: ${Object.keys(project.connections).join(", ")}`
    );
  }
  return { key: `${projectName}:${connectionName}`, config: conn };
}

function ok(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function err(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true as const };
}

// --- server ---

const configPath = process.env.DB_MCP_CONFIG ?? `${process.env.HOME}/.config/db-mcp/config.yaml`;

const server = new McpServer(
  { name: "herbal-multidb-mcp", version: "1.0.0" },
  {
    instructions: [
      `Database MCP server (herbal-multidb-mcp) — read-only by default, supports MySQL, PostgreSQL, ClickHouse, Redis, MongoDB.`,
      `Config file: ${configPath}`,
      ``,
      `Workflow: call list_projects first to see available projects and connections,`,
      `then use the connection name in query / list_tables / describe_table / redis_query / mongo_query.`,
      ``,
      `SQL protection (default read-only):`,
      `  - Default: only SELECT, SHOW, DESCRIBE, EXPLAIN are allowed.`,
      `  - To enable write operations (INSERT/UPDATE/DELETE) on a connection, edit the config file and add "allowWrite: true" to that connection:`,
      `      connections:`,
      `        my-db:`,
      `          type: mysql`,
      `          host: 127.0.0.1`,
      `          allowWrite: true   # enables INSERT/UPDATE/DELETE`,
      `  - DROP and TRUNCATE are always blocked, even with allowWrite.`,
      `  - Multi-statement SQL is always blocked.`,
      ``,
      `Redis: read-only by default (GET, HGETALL, KEYS, PING, etc). With allowWrite: true, also allows SET, DEL, HSET, etc. FLUSHDB/FLUSHALL always blocked.`,
      `MongoDB: read-only (find) by default. With allowWrite: true, use mongo_write tool for insertOne/updateOne/updateMany/deleteOne/deleteMany.`,
    ].join("\n"),
  },
);

// 1. list_projects — no params, returns all projects with their connections
server.tool("list_projects", "List all configured projects and their connections", async () => {
  try {
    const result = Object.entries(config.projects).map(([name, proj]) => ({
      name,
      description: proj.description ?? "",
      workspaces: proj.workspaces,
      connections: Object.entries(proj.connections).map(([connName, conn]) => ({
        name: connName,
        type: conn.type,
        host: conn.host,
        port: conn.port,
        database: conn.database ?? null,
        description: conn.description ?? null,
        readonly: conn.readonly ?? null,
      })),
    }));
    return ok(JSON.stringify(result, null, 2));
  } catch (e) {
    return err((e as Error).message);
  }
});

// 2. list_connections — optional project param, auto-detects from CWD if omitted
server.tool(
  "list_connections",
  "List connections for a project (auto-detected from CWD if project not specified)",
  { project: z.string().optional() },
  async ({ project }) => {
    try {
      const { name, project: proj } = getProject(project);
      const connections = Object.entries(proj.connections).map(([connName, conn]) => ({
        name: connName,
        type: conn.type,
        host: conn.host,
        port: conn.port,
        database: conn.database ?? null,
        description: conn.description ?? null,
        readonly: conn.readonly ?? null,
      }));
      return ok(JSON.stringify({ project: name, connections }, null, 2));
    } catch (e) {
      return err((e as Error).message);
    }
  }
);

// 3. query — connection + sql + optional project, validates SQL before executing
server.tool(
  "query",
  "Run a SQL query on a MySQL, PostgreSQL, or ClickHouse connection",
  {
    connection: z.string(),
    sql: z.string(),
    project: z.string().optional(),
  },
  async ({ connection, sql, project }) => {
    try {
      const { name, project: proj } = getProject(project);
      const { key, config: connCfg } = getConnection(proj, name, connection);
      const guard = validateSql(sql, connCfg.allowWrite);
      if (!guard.ok) {
        return err(`BLOCKED: ${guard.reason}`);
      }
      const result = await execQuery(key, connCfg, sql);
      return ok(JSON.stringify(result, null, 2));
    } catch (e) {
      return err((e as Error).message);
    }
  }
);

// 4. list_tables — connection + optional project
server.tool(
  "list_tables",
  "List tables (or collections for MongoDB) in a connection",
  {
    connection: z.string(),
    project: z.string().optional(),
  },
  async ({ connection, project }) => {
    try {
      const { name, project: proj } = getProject(project);
      const { key, config: connCfg } = getConnection(proj, name, connection);
      const tables = await execListTables(key, connCfg);
      return ok(JSON.stringify({ connection, tables }, null, 2));
    } catch (e) {
      return err((e as Error).message);
    }
  }
);

// 5. describe_table — connection + table + optional project
server.tool(
  "describe_table",
  "Describe the schema of a table or collection",
  {
    connection: z.string(),
    table: z.string(),
    project: z.string().optional(),
  },
  async ({ connection, table, project }) => {
    try {
      const { name, project: proj } = getProject(project);
      const { key, config: connCfg } = getConnection(proj, name, connection);
      const result = await execDescribeTable(key, connCfg, table);
      return ok(JSON.stringify(result, null, 2));
    } catch (e) {
      return err((e as Error).message);
    }
  }
);

// 6. redis_query — connection + command + args + optional project
server.tool(
  "redis_query",
  "Run a read-only Redis command on a Redis connection",
  {
    connection: z.string(),
    command: z.string(),
    args: z.array(z.string()),
    project: z.string().optional(),
  },
  async ({ connection, command, args, project }) => {
    try {
      const { name, project: proj } = getProject(project);
      const { key, config: connCfg } = getConnection(proj, name, connection);
      if (connCfg.type !== "redis") {
        return err(`Connection "${connection}" is type "${connCfg.type}", not "redis".`);
      }
      const result = await queryRedis(key, connCfg, command, args);
      return ok(JSON.stringify(result, null, 2));
    } catch (e) {
      return err((e as Error).message);
    }
  }
);

// 7. mongo_query — connection + collection + optional filter + optional limit + optional project
server.tool(
  "mongo_query",
  "Query a MongoDB collection",
  {
    connection: z.string(),
    collection: z.string(),
    filter: z.string().optional(),
    limit: z.number().int().positive().optional(),
    project: z.string().optional(),
  },
  async ({ connection, collection, filter, limit, project }) => {
    try {
      const { name, project: proj } = getProject(project);
      const { key, config: connCfg } = getConnection(proj, name, connection);
      if (connCfg.type !== "mongo") {
        return err(`Connection "${connection}" is type "${connCfg.type}", not "mongo".`);
      }
      let filterObj: Record<string, unknown> = {};
      if (filter) {
        try {
          filterObj = JSON.parse(filter) as Record<string, unknown>;
        } catch {
          return err(`Invalid JSON in filter: ${filter}`);
        }
      }
      const result = await queryMongo(key, connCfg, collection, filterObj, {
        limit: limit ?? 100,
      });
      return ok(JSON.stringify(result, null, 2));
    } catch (e) {
      return err((e as Error).message);
    }
  }
);

// 8. mongo_write — write operations on MongoDB (requires allowWrite)
const VALID_MONGO_OPS = new Set(["insertOne", "updateOne", "updateMany", "deleteOne", "deleteMany"]);
server.tool(
  "mongo_write",
  "Write to a MongoDB collection (requires allowWrite: true in config). Operations: insertOne, updateOne, updateMany, deleteOne, deleteMany",
  {
    connection: z.string(),
    collection: z.string(),
    operation: z.string().describe("One of: insertOne, updateOne, updateMany, deleteOne, deleteMany"),
    doc: z.string().optional().describe("JSON document for insertOne"),
    filter: z.string().optional().describe("JSON filter for update/delete operations"),
    update: z.string().optional().describe("JSON update expression for updateOne/updateMany"),
    project: z.string().optional(),
  },
  async ({ connection, collection, operation, doc, filter, update, project }) => {
    try {
      if (!VALID_MONGO_OPS.has(operation)) {
        return err(`Invalid operation "${operation}". Must be one of: ${[...VALID_MONGO_OPS].join(", ")}`);
      }
      const { name, project: proj } = getProject(project);
      const { key, config: connCfg } = getConnection(proj, name, connection);
      if (connCfg.type !== "mongo") {
        return err(`Connection "${connection}" is type "${connCfg.type}", not "mongo".`);
      }
      const args: { doc?: Record<string, unknown>; filter?: Record<string, unknown>; update?: Record<string, unknown> } = {};
      if (doc) args.doc = JSON.parse(doc);
      if (filter) args.filter = JSON.parse(filter);
      if (update) args.update = JSON.parse(update);
      const result = await writeMongo(key, connCfg, collection, operation as MongoWriteOp, args);
      return ok(JSON.stringify(result, null, 2));
    } catch (e) {
      return err((e as Error).message);
    }
  }
);

// --- start ---

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  process.on("SIGINT", async () => {
    await closeAll();
    await server.close();
    process.exit(0);
  });
}

main().catch((e) => {
  process.stderr.write(`Fatal: ${(e as Error).message}\n`);
  process.exit(1);
});
