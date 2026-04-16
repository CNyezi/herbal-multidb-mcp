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
  closeAll,
} from "./connection-pool.js";
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

const server = new McpServer({
  name: "db-mcp",
  version: "1.0.0",
});

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
  "Run a SQL query on a MySQL or PostgreSQL connection",
  {
    connection: z.string(),
    sql: z.string(),
    project: z.string().optional(),
  },
  async ({ connection, sql, project }) => {
    try {
      const guard = validateSql(sql);
      if (!guard.ok) {
        return err(`BLOCKED: ${guard.reason}`);
      }
      const { name, project: proj } = getProject(project);
      const { key, config: connCfg } = getConnection(proj, name, connection);
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
