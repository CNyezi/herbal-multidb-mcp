# herbal-multidb-mcp

[English](./README.md)

多项目数据库 MCP 服务器。通过统一接口提供 MySQL、PostgreSQL、Redis、MongoDB 的访问，默认只读保护。

适用于所有支持 MCP 协议的客户端：Claude Code、Cursor、Windsurf、Cline、Continue 等。

## 特性

- **多项目管理** — 按项目组织数据库连接；仅一个项目时自动选中
- **默认只读** — 通过 AST 解析验证 SQL，仅允许 `SELECT`/`SHOW`/`DESCRIBE`/`EXPLAIN`。可按连接设置 `allowWrite: true` 开启写操作（DROP/TRUNCATE 始终禁止）
- **多数据库** — 一个进程同时支持 MySQL、PostgreSQL、Redis、MongoDB
- **连接继承** — 定义基础连接，其他库继承 host/port/user/password
- **环境变量插值** — 配置中使用 `${VAR}` 或 `${VAR:-默认值}`
- **跨机器通用** — 一份配置文件，不同机器填不同值

## 工具列表

| 工具 | 说明 |
|------|------|
| `list_projects` | 列出所有项目及其连接 |
| `list_connections` | 列出某项目的连接 |
| `query` | 执行 SQL（MySQL / PostgreSQL） |
| `list_tables` | 列出表或集合 |
| `describe_table` | 查看表结构 |
| `redis_query` | 执行 Redis 命令 |
| `mongo_query` | 查询 MongoDB 集合 |

## 快速开始

### 1. 创建配置

创建 `~/.config/db-mcp/config.yaml`：

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

### 2. 注册到 MCP 客户端

**Claude Code** — 添加到 `~/.claude.json`（用户级）或项目 `.claude/settings.json`：

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

**Cursor** — 添加到 `.cursor/mcp.json`：

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

其他客户端类似，任何支持 stdio 传输的 MCP 客户端均可使用。

### 从源码安装（可选）

```bash
git clone https://github.com/CNyezi/herbal-multidb-mcp
cd herbal-multidb-mcp
pnpm install && pnpm build
```

然后将 MCP 客户端指向 `dist/index.js`。

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
        allowWrite: false           # 默认 false — 设为 true 允许 INSERT/UPDATE/DELETE
        inherit: <其他连接名>        # 继承另一个连接的字段
```

环境变量在加载时插值：
- `${VAR}` — 替换为 `VAR` 的值
- `${VAR:-默认值}` — `VAR` 未设置时使用默认值

## 安全机制

| 保护项 | 默认模式 | `allowWrite: true` |
|-------|---------|-------------------|
| SELECT / SHOW / DESCRIBE / EXPLAIN | 允许 | 允许 |
| INSERT / UPDATE / DELETE | **禁止** | 允许 |
| DROP / TRUNCATE | **禁止** | **仍然禁止** |
| 多语句 SQL（`;` 注入） | **禁止** | **仍然禁止** |
| Redis 写命令（SET、DEL 等） | **禁止** | **禁止** |
| MongoDB 写操作 | **禁止** | **禁止** |

表名/集合名经正则校验 `[a-zA-Z_][a-zA-Z0-9_]*`，防止注入。

## 发布

通过 GitHub Actions 自动发布：

```bash
# 升版本并打 tag
npm version patch   # 或 minor / major
git push --follow-tags
```

CI 自动跑测试、构建、发布到 npm。

## 许可证

MIT
