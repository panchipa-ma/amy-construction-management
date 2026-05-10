import type { AppUser } from "@workspace/api-client-react";

export type Me = Pick<AppUser, "id" | "role" | "status" | "email" | "displayName">;

export function isInternal(me: Me | null | undefined): boolean {
  return me?.role === "internal" && me?.status === "approved";
}

export function isApproved(me: Me | null | undefined): boolean {
  return me?.status === "approved";
}
