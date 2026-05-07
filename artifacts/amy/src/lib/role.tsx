import { createContext, useContext, useEffect, useState } from "react";

export type Role = "internal" | "external";

const STORAGE_KEY = "amy.role.v1";

const RoleContext = createContext<{
  role: Role;
  setRole: (r: Role) => void;
}>({
  role: "internal",
  setRole: () => {},
});

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [role, setRoleState] = useState<Role>("internal");

  useEffect(() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (v === "internal" || v === "external") setRoleState(v);
    } catch {
      /* ignore */
    }
  }, []);

  const setRole = (r: Role) => {
    setRoleState(r);
    try {
      localStorage.setItem(STORAGE_KEY, r);
    } catch {
      /* ignore */
    }
  };

  return (
    <RoleContext.Provider value={{ role, setRole }}>
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  return useContext(RoleContext);
}

// Paths the external role is allowed to access (prefix match).
export const EXTERNAL_ALLOWED_PREFIXES = [
  "/vendor-invoices",
  "/staff-assignments",
  "/profile",
  "/profile-setup",
];

export function isPathAllowed(role: Role, path: string): boolean {
  if (role === "internal") return true;
  return EXTERNAL_ALLOWED_PREFIXES.some(
    (p) => path === p || path.startsWith(p + "/"),
  );
}
