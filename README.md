# herbal-multidb-mcp

[中文文档](./README.zh-CN.md)

A multi-project database MCP server. Provides read-only access to MySQL, PostgreSQL, Redis, and MongoDB through a single, unified interface.

Works with any MCP-compatible client: Claude Code, Cursor, Windsurf, Cline, Continue, etc.

## Features

- **Multi-project** — organize database connections by project; auto-selects when only one project is configured
- **Read-only by default** — SQL validated via AST parsing; only `SELECT`/`SHOW`/`DESCRIBE`/`EXPLAIN` allowed. Set `allowWrite: true` per connection to enable writes (DROP/TRUNCATE always blocked)
- **Multi-database** — MySQL, PostgreSQL, Redis, MongoDB in one server process
- **Connection inheritance** — define a base connection and inherit host/port/user/password for other databases
- **Environment variable interpolation** — use `${VAR}` or `${VAR:-default}` in config
- **Cross-machine portable** — one config file, different values per machine

## Tools

| Tool | Description |
|------|------------|
| `list_projects` | List all projects and their connections |
| `list_connections` | List connections for a project |
| `query` | Execute SQL (MySQL / PostgreSQL) |
| `list_tables` | List tables or collections |
| `describe_table` | Show table schema |
| `redis_query` | Execute Redis commands |
| `mongo_query` | Query a MongoDB collection |

## Quick Start

### 1. Configure

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

### 2. Register in your MCP client

**Claude Code** — add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "db": {
      "command": "npx",
      "args": ["-y", "herbal-multidb-mcp"]
    }
  }
}
```

**Cursor** — add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "db": {
      "command": "npx",
      "args": ["-y", "herbal-multidb-mcp"]
    }
  }
}
```

Other clients follow the same pattern — any MCP client that supports stdio transport.

### From source (alternative)

```bash
git clone https://github.com/herbal-goodness/herbal-multidb-mcp
cd herbal-multidb-mcp
pnpm install && pnpm build
```

Then point your MCP client to `dist/index.js`.

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
        allowWrite: false           # default false — set true to allow INSERT/UPDATE/DELETE
        inherit: <other-connection> # inherit fields from another connection
```

Environment variables are interpolated at load time:
- `${VAR}` — replaced with the value of `VAR`
- `${VAR:-default}` — uses `default` if `VAR` is not set

## Security

| Protection | Default | With `allowWrite: true` |
|-----------|---------|------------------------|
| SELECT / SHOW / DESCRIBE / EXPLAIN | Allowed | Allowed |
| INSERT / UPDATE / DELETE | **Blocked** | Allowed |
| DROP / TRUNCATE | **Blocked** | **Still blocked** |
| Multi-statement SQL (`;` injection) | **Blocked** | **Still blocked** |
| Redis write commands (SET, DEL, etc.) | **Blocked** | **Blocked** |
| MongoDB writes | **Blocked** | **Blocked** |

Table/collection names are validated against `[a-zA-Z_][a-zA-Z0-9_]*` to prevent injection.

## Publishing

Releases are automated via GitHub Actions:

```bash
# Bump version and tag
npm version patch   # or minor / major
git push --follow-tags
```

The CI pipeline runs tests, builds, and publishes to npm automatically.

## License

MIT
