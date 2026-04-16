import { describe, it, expect } from "vitest";
import { loadConfig, interpolateEnv } from "../src/config.js";

describe("interpolateEnv", () => {
  it("replaces ${VAR} with env value", () => {
    process.env.TEST_HOST = "10.0.0.1";
    expect(interpolateEnv("${TEST_HOST}")).toBe("10.0.0.1");
    delete process.env.TEST_HOST;
  });

  it("uses default when env var missing", () => {
    delete process.env.MISSING_VAR;
    expect(interpolateEnv("${MISSING_VAR:-fallback}")).toBe("fallback");
  });

  it("returns original string when no pattern", () => {
    expect(interpolateEnv("plain-string")).toBe("plain-string");
  });
});

describe("loadConfig", () => {
  it("loads and merges config with secrets", () => {
    const config = loadConfig(
      "tests/fixtures/config.yaml",
      "tests/fixtures/secrets.yaml"
    );
    expect(config.projects.testproject).toBeDefined();
    expect(config.projects.testproject.connections["main-db"].password).toBe("secret123");
  });

  it("resolves inherit references", () => {
    const config = loadConfig(
      "tests/fixtures/config.yaml",
      "tests/fixtures/secrets.yaml"
    );
    const logDb = config.projects.testproject.connections["log-db"];
    expect(logDb.host).toBe("localhost");
    expect(logDb.database).toBe("test_log");
  });
});
