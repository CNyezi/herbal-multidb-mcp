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

export function loadConfig(configPath?: string): DbMcpConfig {
  const cfgPath =
    configPath ?? `${process.env.HOME}/.config/db-mcp/config.yaml`;
  if (!existsSync(cfgPath)) {
    throw new Error(`Config not found: ${cfgPath}`);
  }
  const raw = parseYaml(readFileSync(cfgPath, "utf-8")) as Record<
    string,
    unknown
  >;

  const interpolated = deepInterpolate(raw) as DbMcpConfig;

  for (const project of Object.values(interpolated.projects)) {
    project.connections = resolveInherit(project.connections);
  }

  return interpolated;
}
