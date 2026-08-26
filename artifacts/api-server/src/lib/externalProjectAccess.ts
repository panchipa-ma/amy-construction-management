import { eq, inArray, sql } from "drizzle-orm";
import {
  db,
  projectPhasesTable,
  projectsTable,
  staffTable,
} from "@workspace/db";
import type { AppUserRow } from "./auth";

export type ExternalAssignedProject = {
  id: string;
  name: string;
  unitNumber: string | null;
};

async function getLinkedStaffIds(email: string | null): Promise<string[]> {
  const normalizedEmail = email?.trim();
  if (!normalizedEmail) return [];

  const rows = await db
    .select({ id: staffTable.id })
    .from(staffTable)
    .where(
      sql`lower(${staffTable.email}) = lower(${normalizedEmail}) OR lower(${staffTable.appLoginEmail}) = lower(${normalizedEmail})`,
    );

  return rows.map((row) => row.id);
}

/**
 * Returns only the projects to which an external user is assigned through a
 * project phase. The result deliberately excludes financial and customer data.
 */
export async function listAssignedProjectsForExternalUser(
  user: AppUserRow,
): Promise<ExternalAssignedProject[]> {
  if (user.role !== "external") return [];

  const staffIds = await getLinkedStaffIds(user.email);
  if (staffIds.length === 0) return [];

  const rows = await db
    .select({
      id: projectsTable.id,
      name: projectsTable.name,
      unitNumber: projectsTable.unitNumber,
    })
    .from(projectsTable)
    .innerJoin(
      projectPhasesTable,
      eq(projectPhasesTable.projectId, projectsTable.id),
    )
    .where(inArray(projectPhasesTable.staffId, staffIds));

  const unique = new Map<string, ExternalAssignedProject>();
  for (const row of rows) {
    unique.set(row.id, row);
  }
  return Array.from(unique.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export async function externalUserCanAccessProject(
  user: AppUserRow,
  projectId: string,
): Promise<boolean> {
  if (user.role !== "external") return true;
  const projects = await listAssignedProjectsForExternalUser(user);
  return projects.some((project) => project.id === projectId);
}