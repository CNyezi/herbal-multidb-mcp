import { minimatch } from "minimatch";
import type { DbMcpConfig } from "./types.js";

export function resolveProject(
  config: DbMcpConfig,
  cwd: string
): string | null {
  for (const [name, project] of Object.entries(config.projects)) {
    for (const pattern of project.workspaces) {
      if (cwd === pattern || cwd.startsWith(pattern + "/")) {
        return name;
      }
      if (minimatch(cwd, pattern) || minimatch(cwd, pattern + "/**")) {
        return name;
      }
    }
  }
  return null;
}
