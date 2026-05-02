import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectionConfig } from "../src/types.js";

const calls: Array<[string, ...string[]]> = [];

vi.mock("ioredis", () => ({
  Redis: class MockRedis {
    async connect() {}
    disconnect() {}
    async call(command: string, ...args: string[]) {
      calls.push([command, ...args]);
      return [command, ...args];
    }
  },
}));

const { queryRedis, closeRedisClients } = await import("../src/drivers/redis.js");

const readonlyRedis: ConnectionConfig = {
  type: "redis",
  host: "127.0.0.1",
  port: 6379,
};

describe("queryRedis read-only command guard", () => {
  beforeEach(async () => {
    calls.length = 0;
    await closeRedisClients();
  });

  it("allows CONFIG GET in read-only mode", async () => {
    const result = await queryRedis("test:redis", readonlyRedis, "CONFIG", ["GET", "maxmemory"]);

    expect(calls).toEqual([["config", "GET", "maxmemory"]]);
    expect(result.rows).toEqual([
      { index: 0, value: "config" },
      { index: 1, value: "GET" },
      { index: 2, value: "maxmemory" },
    ]);
  });

  it("allows SLOWLOG GET and SLOWLOG LEN in read-only mode", async () => {
    await queryRedis("test:redis", readonlyRedis, "SLOWLOG", ["GET", "10"]);
    await queryRedis("test:redis", readonlyRedis, "SLOWLOG", ["LEN"]);

    expect(calls).toEqual([
      ["slowlog", "GET", "10"],
      ["slowlog", "LEN"],
    ]);
  });

  it("blocks write-like CONFIG and SLOWLOG subcommands even when allowWrite is true", async () => {
    const writableRedis = { ...readonlyRedis, allowWrite: true };

    await expect(queryRedis("test:redis", writableRedis, "CONFIG", ["SET", "maxmemory", "0"])).rejects.toThrow(
      /not allowed/i,
    );
    await expect(queryRedis("test:redis", writableRedis, "CONFIG", ["REWRITE"])).rejects.toThrow(/not allowed/i);
    await expect(queryRedis("test:redis", writableRedis, "SLOWLOG", ["RESET"])).rejects.toThrow(/not allowed/i);
    expect(calls).toEqual([]);
  });

  it("allows common Redis introspection commands in read-only mode", async () => {
    await queryRedis("test:redis", readonlyRedis, "COMMAND", ["INFO", "get"]);
    await queryRedis("test:redis", readonlyRedis, "CLIENT", ["LIST"]);
    await queryRedis("test:redis", readonlyRedis, "MEMORY", ["STATS"]);
    await queryRedis("test:redis", readonlyRedis, "LATENCY", ["LATEST"]);

    expect(calls).toEqual([
      ["command", "INFO", "get"],
      ["client", "LIST"],
      ["memory", "STATS"],
      ["latency", "LATEST"],
    ]);
  });

  it("blocks write-like introspection subcommands", async () => {
    const writableRedis = { ...readonlyRedis, allowWrite: true };

    await expect(queryRedis("test:redis", writableRedis, "CLIENT", ["KILL", "127.0.0.1:6379"])).rejects.toThrow(
      /not allowed/i,
    );
    await expect(queryRedis("test:redis", writableRedis, "CLIENT", ["SETNAME", "agent"])).rejects.toThrow(/not allowed/i);
    await expect(queryRedis("test:redis", writableRedis, "MEMORY", ["PURGE"])).rejects.toThrow(/not allowed/i);
    expect(calls).toEqual([]);
  });
});
