import { describe, it, expect } from "vitest";
import { validateSql } from "../src/sql-guard.js";

describe("validateSql", () => {
  // Allowed
  it("allows simple SELECT", () => {
    expect(validateSql("SELECT * FROM users")).toEqual({ ok: true });
  });

  it("allows SELECT with JOIN and WHERE", () => {
    expect(
      validateSql("SELECT u.name, o.id FROM users u JOIN orders o ON u.id = o.user_id WHERE u.active = 1")
    ).toEqual({ ok: true });
  });

  it("allows SELECT with subquery", () => {
    expect(
      validateSql("SELECT * FROM users WHERE id IN (SELECT user_id FROM orders)")
    ).toEqual({ ok: true });
  });

  it("allows SHOW statements", () => {
    expect(validateSql("SHOW TABLES")).toEqual({ ok: true });
  });

  it("allows DESCRIBE/DESC", () => {
    expect(validateSql("DESCRIBE users")).toEqual({ ok: true });
  });

  it("allows EXPLAIN", () => {
    expect(validateSql("EXPLAIN SELECT * FROM users")).toEqual({ ok: true });
  });

  // Blocked
  it("blocks INSERT", () => {
    const result = validateSql("INSERT INTO users (name) VALUES ('test')");
    expect(result.ok).toBe(false);
  });

  it("blocks UPDATE", () => {
    const result = validateSql("UPDATE users SET name = 'test'");
    expect(result.ok).toBe(false);
  });

  it("blocks DELETE", () => {
    const result = validateSql("DELETE FROM users WHERE id = 1");
    expect(result.ok).toBe(false);
  });

  it("blocks DROP", () => {
    const result = validateSql("DROP TABLE users");
    expect(result.ok).toBe(false);
  });

  it("blocks ALTER", () => {
    const result = validateSql("ALTER TABLE users ADD COLUMN age INT");
    expect(result.ok).toBe(false);
  });

  it("blocks TRUNCATE", () => {
    const result = validateSql("TRUNCATE TABLE users");
    expect(result.ok).toBe(false);
  });

  it("blocks multi-statement injection", () => {
    const result = validateSql("SELECT 1; DROP TABLE users");
    expect(result.ok).toBe(false);
  });

  // allowWrite mode
  it("allows INSERT when allowWrite is true", () => {
    expect(validateSql("INSERT INTO users (name) VALUES ('test')", true)).toEqual({ ok: true });
  });

  it("allows UPDATE when allowWrite is true", () => {
    expect(validateSql("UPDATE users SET name = 'test' WHERE id = 1", true)).toEqual({ ok: true });
  });

  it("allows DELETE when allowWrite is true", () => {
    expect(validateSql("DELETE FROM users WHERE id = 1", true)).toEqual({ ok: true });
  });

  it("still blocks DROP even with allowWrite", () => {
    const result = validateSql("DROP TABLE users", true);
    expect(result.ok).toBe(false);
  });

  it("still blocks TRUNCATE even with allowWrite", () => {
    const result = validateSql("TRUNCATE TABLE users", true);
    expect(result.ok).toBe(false);
  });

  it("still blocks multi-statement even with allowWrite", () => {
    const result = validateSql("INSERT INTO users (name) VALUES ('a'); DROP TABLE users", true);
    expect(result.ok).toBe(false);
  });

  // Security — fail-closed on parse failure (issue #1)
  it("fail-closed: rejects an unparseable SELECT in read-only mode", () => {
    // node-sql-parser cannot parse JSON_TABLE; must NOT fall through to allow.
    const result = validateSql("SELECT JSON_TABLE(@x, '$[*]' COLUMNS(v INT PATH '$')) AS j");
    expect(result.ok).toBe(false);
  });

  it("fail-closed: rejects an unparseable statement with allowWrite (could hide DROP/TRUNCATE)", () => {
    const result = validateSql("TRUNCATE users PARTITION (p0)", true);
    expect(result.ok).toBe(false);
  });

  // Security — block file I/O that parses as a plain SELECT
  it("blocks SELECT ... INTO OUTFILE in read-only mode", () => {
    expect(validateSql("SELECT * FROM users INTO OUTFILE '/tmp/pwn'").ok).toBe(false);
  });

  it("blocks SELECT ... INTO DUMPFILE in read-only mode", () => {
    expect(validateSql("SELECT data FROM t INTO DUMPFILE '/tmp/pwn'").ok).toBe(false);
  });

  it("blocks load_file() in read-only mode", () => {
    expect(validateSql("SELECT load_file('/etc/passwd')").ok).toBe(false);
  });

  it("blocks INTO OUTFILE even with allowWrite", () => {
    expect(validateSql("SELECT * FROM users INTO OUTFILE '/tmp/pwn'", true).ok).toBe(false);
  });

  it("blocks LOAD DATA INFILE even with allowWrite", () => {
    expect(validateSql("LOAD DATA INFILE '/tmp/x' INTO TABLE t", true).ok).toBe(false);
  });
});
