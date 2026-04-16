import { readFileSync, existsSync } from "fs";
import { parse as parseYaml } from "yaml";
import type { DbMcpConfig, ConnectionConfig } from "./types.js";

const ENV_PATTERN = /\$\{([^}]+)\}/g;

export function interpolateEnv(value: string): string {
  return value.replace(ENV_PATTERN, (_, expr: string) => {
    const [varName, defaultVal] = expr.split(":-");
    return process.env[varName] ?? defaultVal ?? "";
  });
}

function deepInterpolate(obj: unknown): unknown {
  if (typeof obj === "string") return interpolateEnv(obj);
  if (Array.isArray(obj)) return obj.map(deepInterpolate);
  if (obj !== null && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      result[k] = deepInterpolate(v);
    }
    return result;
  }
  return obj;
}

function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>
): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === "object" &&
      !Array.isArray(source[key]) &&
      target[key] &&
      typeof target[key] === "object" &&
      !Array.isArray(target[key])
    ) {
      result[key] = deepMerge(
        target[key] as Record<string, unknown>,
        source[key] as Record<string, unknown>
      );
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

function resolveInherit(
  connections: Record<string, ConnectionConfig>
): Record<string, ConnectionConfig> {
  const resolved: Record<string, ConnectionConfig> = {};
  for (const [name, conn] of Object.entries(connections)) {
    if (conn.inherit) {
      const parent = connections[conn.inherit];
      if (!parent)
        throw new Error(
          `inherit target "${conn.inherit}" not found for "${name}"`
        );
      const { inherit: _, ...ownFields } = conn;
      resolved[name] = { ...parent, ...stripUndefined(ownFields) };
    } else {
      resolved[name] = { ...conn };
    }
  }
  return resolved;
}

function stripUndefined(
  obj: Record<string, unknown>
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  ) as Record<string, unknown>;
}

export function loadConfig(
  configPath?: string,
  secretsPath?: string
): DbMcpConfig {
  const cfgPath =
    configPath ?? `${process.env.HOME}/.config/db-mcp/config.yaml`;
  if (!existsSync(cfgPath)) {
    throw new Error(`Config not found: ${cfgPath}`);
  }
  const raw = parseYaml(readFileSync(cfgPath, "utf-8")) as Record<
    string,
    unknown
  >;

  const secPath =
    secretsPath ?? `${process.env.HOME}/.config/db-mcp/secrets.local.yaml`;
  let merged = raw;
  if (existsSync(secPath)) {
    const secrets = parseYaml(readFileSync(secPath, "utf-8")) as Record<
      string,
      unknown
    > | null;
    if (secrets) {
      merged = deepMerge(raw, secrets);
    }
  }

  const interpolated = deepInterpolate(merged) as DbMcpConfig;

  for (const project of Object.values(interpolated.projects)) {
    project.connections = resolveInherit(project.connections);
  }

  return interpolated;
}
