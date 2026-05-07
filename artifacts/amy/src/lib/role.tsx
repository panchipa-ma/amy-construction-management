import { createContext, useContext } from "react";
import { useGetMe } from "@workspace/api-client-react";

export type Role = "internal" | "external";
export type Status = "pending" | "approved";

export type Me = {
  id: string;
  role: Role;
  status: Status;
  displayName: string | null;
  email: string | null;
};

type Ctx = {
  me: Me | null;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
};

const RoleContext = createContext<Ctx>({
  me: null,
  isLoading: true,
  isError: false,
  refetch: () => {},
});

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const meQ = useGetMe();
  const me: Me | null = meQ.data
    ? {
        id: meQ.data.id,
        role: meQ.data.role,
        status: meQ.data.status,
        displayName: meQ.data.displayName ?? null,
        email: meQ.data.email ?? null,
      }
    : null;
  return (
    <RoleContext.Provider
      value={{
        me,
        isLoading: meQ.isLoading,
        isError: meQ.isError,
        refetch: () => {
          void meQ.refetch();
        },
      }}
    >
      {children}
    </RoleContext.Provider>
  );
}

export function useMe() {
  return useContext(RoleContext);
}

/** Backwards-compat shim used by sidebar & RoleGuard. */
export function useRole(): { role: Role; status: Status } {
  const { me } = useContext(RoleContext);
  return {
    role: me?.role ?? "external",
    status: me?.status ?? "pending",
  };
}

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
