import { describe, expect, it } from "vitest";
import {
  assignableRoles,
  can,
  canManageMember,
  isWorkspaceRole,
  WORKSPACE_ROLES,
  type Permission,
  type WorkspaceRole,
} from "@/lib/permissions";

const PERMISSIONS: Permission[] = [
  "link:read",
  "link:write",
  "members:manage",
  "workspace:update",
  "workspace:delete",
];

/** What each role may do, spelled out so a change to the table shows up here. */
const EXPECTED: Record<WorkspaceRole, Permission[]> = {
  viewer: ["link:read"],
  editor: ["link:read", "link:write"],
  admin: ["link:read", "link:write", "members:manage", "workspace:update"],
  owner: PERMISSIONS,
};

describe("can", () => {
  for (const role of WORKSPACE_ROLES) {
    it(`gives ${role} exactly its permissions`, () => {
      for (const permission of PERMISSIONS) {
        expect(can(role, permission), `${role} ${permission}`).toBe(EXPECTED[role].includes(permission));
      }
    });
  }

  it("grows with the role: each one can do everything the one below can", () => {
    const order: WorkspaceRole[] = ["viewer", "editor", "admin", "owner"];
    for (const [index, role] of order.entries()) {
      const below = order[index - 1];
      if (!below) continue;
      for (const permission of EXPECTED[below]) expect(can(role, permission)).toBe(true);
    }
  });
});

describe("assignableRoles and canManageMember", () => {
  it("lets owners hand out any role, admins only editor and viewer, others nothing", () => {
    expect(assignableRoles("owner")).toEqual(WORKSPACE_ROLES);
    expect(assignableRoles("admin")).toEqual(["editor", "viewer"]);
    expect(assignableRoles("editor")).toEqual([]);
    expect(assignableRoles("viewer")).toEqual([]);
  });

  it("lets owners manage anyone and admins only editors and viewers", () => {
    for (const target of WORKSPACE_ROLES) expect(canManageMember("owner", target)).toBe(true);
    expect(canManageMember("admin", "viewer")).toBe(true);
    expect(canManageMember("admin", "editor")).toBe(true);
    expect(canManageMember("admin", "admin")).toBe(false);
    expect(canManageMember("admin", "owner")).toBe(false);
  });

  it("lets editors and viewers manage nobody", () => {
    for (const actor of ["editor", "viewer"] as const) {
      for (const target of WORKSPACE_ROLES) expect(canManageMember(actor, target)).toBe(false);
    }
  });
});

describe("isWorkspaceRole", () => {
  it("accepts the four roles only", () => {
    for (const role of WORKSPACE_ROLES) expect(isWorkspaceRole(role)).toBe(true);
    for (const value of ["", "root", "Owner", "member", "__proto__"])
      expect(isWorkspaceRole(value)).toBe(false);
  });
});
