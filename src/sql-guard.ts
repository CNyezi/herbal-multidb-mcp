import pkg from "node-sql-parser";
const { Parser } = pkg;

const ALLOWED_TYPES = new Set([
  "select",
  "show",
  "desc",
  "describe",
  "explain",
]);

const MULTI_STATEMENT_RE = /;\s*\S/;
// Always-blocked file I/O: these parse as a normal "select"/write statement but read
// or write arbitrary files on the DB host (SELECT ... INTO OUTFILE/DUMPFILE, load_file(),
// LOAD DATA INFILE), so the statement-type allowlist alone would let them through.
const FILE_IO_RE = /\b(INTO\s+(OUT|DUMP)FILE|LOAD_FILE|LOAD\s+DATA)\b/i;

const DANGEROUS_TYPES = new Set(["drop", "truncate"]);

type ValidationResult = { ok: true } | { ok: false; reason: string };

export function validateSql(sql: string, allowWrite = false): ValidationResult {
  // Always block multi-statement (injection risk)
  if (MULTI_STATEMENT_RE.test(sql)) {
    return { ok: false, reason: "Multi-statement SQL is not allowed" };
  }

  // Always block file I/O — parses as an ordinary statement but reads/writes host files
  if (FILE_IO_RE.test(sql)) {
    return { ok: false, reason: "File I/O (INTO OUTFILE/DUMPFILE, LOAD_FILE, LOAD DATA) is not allowed" };
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
      // Fail-closed: an unparseable query could hide a DROP/TRUNCATE, so reject it.
      return { ok: false, reason: "Could not parse SQL; rejected so DROP/TRUNCATE stay blocked." };
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
    // Fail-closed: cannot verify the statement type, so reject it.
    return { ok: false, reason: "Could not parse SQL. Only SELECT, SHOW, DESCRIBE, EXPLAIN are allowed." };
  }
}
