import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectionConfig } from "../src/types.js";

const poolOpts: Array<Record<string, unknown>> = [];

vi.mock("pg", () => ({
  default: {
    Pool: class MockPool {
      constructor(opts: Record<string, unknown>) {
        poolOpts.push(opts);
      }
      async query() {
        return { fields: [], rows: [] };
      }
      async end() {}
    },
  },
}));

const { queryPostgres, closePostgresPools } = await import("../src/drivers/postgres.js");

const baseConfig: ConnectionConfig = {
  type: "postgres",
  host: "127.0.0.1",
  port: 5432,
};

describe("postgres TLS wiring", () => {
  beforeEach(async () => {
    poolOpts.length = 0;
    await closePostgresPools();
  });

  it("omits ssl by default", async () => {
    await queryPostgres("test:pg-plain", baseConfig, "SELECT 1");
    expect(poolOpts.at(-1)?.ssl).toBeUndefined();
  });

  it("enables ssl with verification by default when tls is true", async () => {
    await queryPostgres("test:pg-tls", { ...baseConfig, tls: true }, "SELECT 1");
    expect(poolOpts.at(-1)?.ssl).toEqual({ rejectUnauthorized: true });
  });

  it("skips verification only when tlsRejectUnauthorized is explicitly false", async () => {
    await queryPostgres(
      "test:pg-tls-insecure",
      { ...baseConfig, tls: true, tlsRejectUnauthorized: false },
      "SELECT 1",
    );
    expect(poolOpts.at(-1)?.ssl).toEqual({ rejectUnauthorized: false });
  });
});
