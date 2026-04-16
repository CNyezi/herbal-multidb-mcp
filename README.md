# db-mcp

A multi-project database MCP server for Claude Code. Provides read-only access to MySQL, PostgreSQL, Redis, and MongoDB through a single, unified interface.

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

### 3. Register in Claude Code

Add to `~/.claude/settings.json`:

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

Restart Claude Code. Verify with `/mcp`.

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

---

# db-mcp（中文）

面向 Claude Code 的多项目数据库 MCP 服务器。通过统一接口提供 MySQL、PostgreSQL、Redis、MongoDB 的只读访问。

## 特性

- **多项目管理** — 按项目组织数据库连接；仅一个项目时自动选中
- **只读保护** — 通过 AST 解析验证 SQL，仅允许 `SELECT`、`SHOW`、`DESCRIBE`、`EXPLAIN`
- **多数据库** — 一个进程同时支持 MySQL、PostgreSQL、Redis、MongoDB
- **连接继承** — 定义基础连接，其他库继承 host/port/user/password
- **环境变量插值** — 配置中使用 `${VAR}` 或 `${VAR:-默认值}`
- **跨机器通用** — 一份配置文件，不同机器填不同值

## 快速开始

### 1. 安装构建

```bash
cd ~/code/js/db-mcp
pnpm install
pnpm build
```

### 2. 创建配置

创建 `~/.config/db-mcp/config.yaml`（参考 `config.example.yaml`），填入实际连接信息。

```bash
chmod 600 ~/.config/db-mcp/config.yaml
```

### 3. 注册到 Claude Code

在 `~/.claude/settings.json` 的 `mcpServers` 中添加：

```json
{
  "db": {
    "command": "node",
    "args": ["/path/to/db-mcp/dist/index.js"]
  }
}
```

重启 Claude Code，用 `/mcp` 确认加载成功。

## 安全机制

- SQL 语句经 AST 解析验证，写操作被拦截
- 分号注入（多语句）被拦截
- Redis 仅允许只读命令
- MongoDB 仅执行 `find` 查询
- 表名/集合名经正则校验，防止注入
