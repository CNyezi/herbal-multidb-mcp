# herbal-multidb-mcp

## Tech Stack

- TypeScript ESM (`"type": "module"`)
- pnpm (not npm/yarn)
- vitest for testing
- `@modelcontextprotocol/sdk` for MCP server
- Database drivers: `mysql2`, `pg`, `ioredis`, `mongodb`
- `node-sql-parser` for SQL AST validation

## Project Structure

```
src/
├── index.ts              # MCP server entry + 8 tool registrations
├── config.ts             # YAML config loading, env var interpolation, inherit resolution
├── sql-guard.ts          # SQL validation (AST + regex fallback, allowWrite support)
├── connection-pool.ts    # Unified dispatcher routing by db type
├── drivers/
│   ├── mysql.ts          # MySQL pool + query/list/describe
│   ├── postgres.ts       # PostgreSQL pool + query/list/describe
│   ├── redis.ts          # Redis client, read/write command allowlists
│   └── mongo.ts          # MongoDB client, find + write ops
└── types.ts              # Shared type definitions
```

Config at runtime: `~/.config/db-mcp/config.yaml`

## Development

```bash
pnpm install
pnpm test          # vitest run
pnpm build         # tsc → dist/
```

## Release & CI

GitHub Actions handles everything automatically:

- **CI** (`.github/workflows/ci.yml`) — runs `pnpm test` + `pnpm build` on every push/PR to master
- **Publish** (`.github/workflows/publish.yml`) — publishes to npm when a `v*` tag is pushed

### How to release

```bash
npm version patch   # or minor / major — bumps version + creates git tag
git push --follow-tags   # pushes code + tag → CI auto-publishes to npm
```

### npm token

- Type: **Automation** (classic token, bypasses 2FA for CI)
- Stored in GitHub repo secret: `NPM_TOKEN`
- If token expires: create new Automation token at https://www.npmjs.com/settings/holtye/tokens, then update:
  ```bash
  gh secret set NPM_TOKEN --repo CNyezi/herbal-multidb-mcp --body "npm_NEW_TOKEN_HERE"
  ```

## Key Design Decisions

- **Read-only by default** — SQL guard blocks writes unless `allowWrite: true` per connection. DROP/TRUNCATE and multi-statement SQL always blocked.
- **Single config file** — no separate secrets file, passwords go directly in `config.yaml` (chmod 600).
- **Auto-select project** — when only one project configured, no need to specify project name.
- **ESM + CJS compat** — `node-sql-parser` is CJS, imported via `import pkg from "node-sql-parser"` pattern.
