# db-mcp

[English](./README.md)

多项目数据库 MCP 服务器。通过统一接口提供 MySQL、PostgreSQL、Redis、MongoDB 的只读访问。

适用于所有支持 MCP 协议的客户端：Claude Code、Cursor、Windsurf、Cline、Continue 等。

## 特性

- **多项目管理** — 按项目组织数据库连接；仅一个项目时自动选中
- **只读保护** — 通过 AST 解析验证 SQL，仅允许 `SELECT`、`SHOW`、`DESCRIBE`、`EXPLAIN`
- **多数据库** — 一个进程同时支持 MySQL、PostgreSQL、Redis、MongoDB
- **连接继承** — 定义基础连接，其他库继承 host/port/user/password
- **环境变量插值** — 配置中使用 `${VAR}` 或 `${VAR:-默认值}`
- **跨机器通用** — 一份配置文件，不同机器填不同值

## 工具列表

| 工具 | 说明 |
|------|------|
| `list_projects` | 列出所有项目及其连接 |
| `list_connections` | 列出某项目的连接 |
| `query` | 执行只读 SQL（MySQL / PostgreSQL） |
| `list_tables` | 列出表或集合 |
| `describe_table` | 查看表结构 |
| `redis_query` | 执行只读 Redis 命令 |
| `mongo_query` | 查询 MongoDB 集合 |

## 快速开始

### 1. 安装构建

```bash
cd ~/code/js/db-mcp
pnpm install
pnpm build
```

### 2. 创建配置

创建 `~/.config/db-mcp/config.yaml`（参考 `config.example.yaml`）：

```yaml
projects:
  my-project:
    description: "我的项目"
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
        inherit: main-db          # 继承 main-db 的 host/port/user/password
      cache:
        type: redis
        host: 127.0.0.1
        port: 6379
        password: redis_password
```

保护配置文件：

```bash
chmod 600 ~/.config/db-mcp/config.yaml
```

### 3. 注册到 MCP 客户端

**Claude Code** — 添加到 `~/.claude/settings.json`：

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

**Cursor** — 添加到 `.cursor/mcp.json`：

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

其他客户端类似，通过 stdio 传输指向 `dist/index.js` 入口即可。

## 配置参考

```yaml
projects:
  <项目名>:
    description: "可选描述"
    connections:
      <连接名>:
        type: mysql | postgres | redis | mongo
        host: <主机名或 IP>
        port: <端口>
        database: <数据库名>
        user: <用户名>
        password: <密码或 ${环境变量}>
        description: "可选连接描述"
        readonly: true              # 元数据标记
        inherit: <其他连接名>        # 继承另一个连接的字段
```

环境变量在加载时插值：
- `${VAR}` — 替换为 `VAR` 的值
- `${VAR:-默认值}` — `VAR` 未设置时使用默认值

## 安全机制

- SQL 语句经 AST 解析验证，写操作（`INSERT`、`UPDATE`、`DELETE`、`DROP` 等）被拦截
- 分号注入（多语句）被拦截
- Redis 仅允许只读命令（`GET`、`HGETALL`、`KEYS`、`PING` 等）
- MongoDB 仅执行 `find` 查询
- 表名/集合名经正则校验，防止注入
