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
});
