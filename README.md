# db-mcp

[中文文档](./README.zh-CN.md)

A multi-project database MCP server. Provides read-only access to MySQL, PostgreSQL, Redis, and MongoDB through a single, unified interface.

Works with any MCP-compatible client: Claude Code, Cursor, Windsurf, Cline, Continue, etc.

## Features

- **Multi-project** — organize database connections by project; auto-selects when only one project is configured
- **Read-only enforcement** — SQL statements are validated via AST parsing; only `SELECT`, `SHOW`, `DESCRIBE`, `EXPLAIN` are allowed
- **Multi-database** — MySQL, PostgreSQL, Redis, MongoDB in one server process
- **Connection inheritance** — define a base connection and inherit host/port/user/password for other databases
- **Environment variable interpolation** — use `${VAR}` or `${VAR:-default}` in config
- **Cross-machine portable** — one config file, different values per machine

## Tools

| Tool | Description |
|------|------------|
| `list_projects` | List all projects and their connections |
| `list_connections` | List connections for a project |
| `query` | Execute read-only SQL (MySQL / PostgreSQL) |
| `list_tables` | List tables or collections |
| `describe_table` | Show table schema |
| `redis_query` | Execute read-only Redis commands |
| `mongo_query` | Query a MongoDB collection |

## Setup

### 1. Install & build

```bash
cd ~/code/js/db-mcp
pnpm install
pnpm build
```

### 2. Configure

Create `~/.config/db-mcp/config.yaml`:

```yaml
projects:
  my-project:
    description: "My project databases"
    connections:
      main-db:
        type: mysql
        host: 127.0.0.1
        port: 3306
        database: my_db
        user: readonly
        password: your_password
      log-db:
        type: mysql
        database: my_log
        inherit: main-db          # reuses host/port/user/password from main-db
      cache:
        type: redis
        host: 127.0.0.1
        port: 6379
        password: redis_password
```

Protect the file:

```bash
chmod 600 ~/.config/db-mcp/config.yaml
```

### 3. Register in your MCP client

**Claude Code** — add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "db": {
      "command": "node",
      "args": ["/path/to/db-mcp/dist/index.js"]
    }
  }
}
```

**Cursor** — add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "db": {
      "command": "node",
      "args": ["/path/to/db-mcp/dist/index.js"]
    }
  }
}
```

Other clients follow the same pattern — point to the `dist/index.js` entry point via stdio transport.

## Config Reference

```yaml
projects:
  <project-name>:
    description: "Optional description"
    connections:
      <connection-name>:
        type: mysql | postgres | redis | mongo
        host: <hostname or IP>
        port: <port number>
        database: <database name>
        user: <username>
        password: <password or ${ENV_VAR}>
        description: "Optional connection description"
        readonly: true              # metadata flag
        inherit: <other-connection> # inherit fields from another connection
```

Environment variables are interpolated at load time:
- `${VAR}` — replaced with the value of `VAR`
- `${VAR:-default}` — uses `default` if `VAR` is not set

## Security

- SQL is parsed and validated before execution — write operations (`INSERT`, `UPDATE`, `DELETE`, `DROP`, etc.) are blocked
- Multi-statement SQL (`;` injection) is blocked
- Redis only allows read commands (`GET`, `HGETALL`, `KEYS`, `PING`, etc.)
- MongoDB queries are read-only (`find` only)
- Table/collection names are validated against `[a-zA-Z_][a-zA-Z0-9_]*`
