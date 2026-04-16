import { Parser } from "node-sql-parser";

const ALLOWED_TYPES = new Set([
  "select",
  "show",
  "desc",
  "describe",
  "explain",
]);

const SAFE_STATEMENT_RE = /^\s*(SELECT|SHOW|DESCRIBE|DESC|EXPLAIN)\b/i;
const MULTI_STATEMENT_RE = /;\s*\S/;

type ValidationResult = { ok: true } | { ok: false; reason: string };

export function validateSql(sql: string): ValidationResult {
  if (MULTI_STATEMENT_RE.test(sql)) {
    return { ok: false, reason: "Multi-statement SQL is not allowed" };
  }

  const parser = new Parser();
  try {
    const ast = parser.astify(sql, { database: "MySQL" });
    const statements = Array.isArray(ast) ? ast : [ast];

    for (const stmt of statements) {
      if (!ALLOWED_TYPES.has(stmt.type?.toLowerCase())) {
        return {
          ok: false,
          reason: `Statement type "${stmt.type}" is not allowed. Only SELECT, SHOW, DESCRIBE, EXPLAIN are permitted.`,
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
