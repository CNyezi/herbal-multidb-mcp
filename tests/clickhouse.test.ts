import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectionConfig } from "../src/types.js";

const clientOpts: Array<Record<string, unknown>> = [];

vi.mock("@clickhouse/client", () => ({
  createClient: (opts: Record<string, unknown>) => {
    clientOpts.push(opts);
    return {
      query: async () => ({ json: async () => [] }),
      close: async () => {},
    };
  },
}));

const { queryClickHouse, closeClickHousePools } = await import("../src/drivers/clickhouse.js");

const baseConfig: ConnectionConfig = {
  type: "clickhouse",
  host: "127.0.0.1",
  port: 8123,
};

describe("clickhouse TLS wiring", () => {
  beforeEach(async () => {
    clientOpts.length = 0;
    await closeClickHousePools();
  });

  it("uses http and no agent override by default", async () => {
    await queryClickHouse("test:ch-plain", baseConfig, "SELECT 1");
    const opts = clientOpts.at(-1);
    expect(opts?.url).toBe("http://127.0.0.1:8123");
    expect(opts?.http_agent).toBeUndefined();
  });

  it("uses https when tls is true", async () => {
    await queryClickHouse("test:ch-tls", { ...baseConfig, tls: true }, "SELECT 1");
    const opts = clientOpts.at(-1);
    expect(opts?.url).toBe("https://127.0.0.1:8123");
    expect(opts?.http_agent).toBeUndefined();
  });

  it("adds an insecure http_agent only when tlsRejectUnauthorized is explicitly false", async () => {
    await queryClickHouse(
      "test:ch-tls-insecure",
      { ...baseConfig, tls: true, tlsRejectUnauthorized: false },
      "SELECT 1",
    );
    const opts = clientOpts.at(-1);
    expect(opts?.url).toBe("https://127.0.0.1:8123");
    expect(opts?.http_agent).toBeDefined();
  });
});
