import { describe, it, expect } from "vitest";
import { resolveProject } from "../src/project-resolver.js";
import type { DbMcpConfig } from "../src/types.js";

const mockConfig: DbMcpConfig = {
  projects: {
    myapp: {
      description: "MyApp",
      workspaces: ["/home/user/workspace", "/home/user/code/go/myapp-*"],
      connections: {},
    },
    saas: {
      description: "SaaS",
      workspaces: ["/home/user/code/saas-*"],
      connections: {},
    },
  },
};

describe("resolveProject", () => {
  it("matches exact path", () => {
    expect(resolveProject(mockConfig, "/home/user/workspace")).toBe("myapp");
  });

  it("matches subdirectory of workspace", () => {
    expect(resolveProject(mockConfig, "/home/user/workspace/go/myapp-api-2")).toBe("myapp");
  });

  it("matches glob pattern", () => {
    expect(resolveProject(mockConfig, "/home/user/code/go/myapp-api-2")).toBe("myapp");
  });

  it("returns null for unmatched path", () => {
    expect(resolveProject(mockConfig, "/home/user/random-dir")).toBeNull();
  });
});
