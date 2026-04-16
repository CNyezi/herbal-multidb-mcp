import pkg from "node-sql-parser";
const { Parser } = pkg;

const ALLOWED_TYPES = new Set([
  "select",
  "show",
  "desc",
  "describe",
  "explain",
]);

const SAFE_STATEMENT_RE = /^\s*(SELECT|SHOW|DESCRIBE|DESC|EXPLAIN)\b/i;
const MULTI_STATEMENT_RE = /;\s*\S/;

const DANGEROUS_TYPES = new Set(["drop", "truncate"]);

type ValidationResult = { ok: true } | { ok: false; reason: string };

export function validateSql(sql: string, allowWrite = false): ValidationResult {
  // Always block multi-statement (injection risk)
  if (MULTI_STATEMENT_RE.test(sql)) {
    return { ok: false, reason: "Multi-statement SQL is not allowed" };
  }

  // If allowWrite, only block DROP/TRUNCATE and multi-statement
  if (allowWrite) {
    const parser = new Parser();
    try {
      const ast = parser.astify(sql, { database: "MySQL" });
      const statements = Array.isArray(ast) ? ast : [ast];
      for (const stmt of statements) {
        if (DANGEROUS_TYPES.has(stmt.type?.toLowerCase())) {
          return { ok: false, reason: `"${stmt.type}" is always blocked, even with allowWrite.` };
        }
      }
    } catch {
      // Can't parse — let it through if allowWrite (user takes responsibility)
    }
    return { ok: true };
  }

  // Default: read-only
  const parser = new Parser();
  try {
    const ast = parser.astify(sql, { database: "MySQL" });
    const statements = Array.isArray(ast) ? ast : [ast];

    for (const stmt of statements) {
      if (!ALLOWED_TYPES.has(stmt.type?.toLowerCase())) {
        return {
          ok: false,
          reason: `Statement type "${stmt.type}" is not allowed. Only SELECT, SHOW, DESCRIBE, EXPLAIN are permitted. Set allowWrite: true in config to enable write operations.`,
        };
      }
    }
    return { ok: true };
  } catch {
    if (SAFE_STATEMENT_RE.test(sql.trim())) {
      return { ok: true };
    }
    return { ok: false, reason: "Could not parse SQL. Only SELECT, SHOW, DESCRIBE, EXPLAIN are allowed." };
  }
}
