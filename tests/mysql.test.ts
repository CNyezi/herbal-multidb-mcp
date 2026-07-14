import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectionConfig } from "../src/types.js";

const poolOpts: Array<Record<string, unknown>> = [];

vi.mock("mysql2/promise", () => ({
  default: {
    createPool: (opts: Record<string, unknown>) => {
      poolOpts.push(opts);
      return {
        query: async () => [[], []],
        end: async () => {},
      };
    },
  },
}));

const { queryMysql, closeMysqlPools } = await import("../src/drivers/mysql.js");

const baseConfig: ConnectionConfig = {
  type: "mysql",
  host: "127.0.0.1",
  port: 3306,
};

describe("mysql TLS wiring", () => {
  beforeEach(async () => {
    poolOpts.length = 0;
    await closeMysqlPools();
  });

  it("omits ssl by default", async () => {
    await queryMysql("test:mysql-plain", baseConfig, "SELECT 1");
    expect(poolOpts.at(-1)?.ssl).toBeUndefined();
  });

  it("enables ssl with verification by default when tls is true", async () => {
    await queryMysql("test:mysql-tls", { ...baseConfig, tls: true }, "SELECT 1");
    expect(poolOpts.at(-1)?.ssl).toEqual({ rejectUnauthorized: true });
  });

  it("skips verification only when tlsRejectUnauthorized is explicitly false", async () => {
    await queryMysql(
      "test:mysql-tls-insecure",
      { ...baseConfig, tls: true, tlsRejectUnauthorized: false },
      "SELECT 1",
    );
    expect(poolOpts.at(-1)?.ssl).toEqual({ rejectUnauthorized: false });
  });
});
