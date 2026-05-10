type UserResource = {
  unsafeMetadata?: Record<string, unknown> | undefined;
  update: (params: { unsafeMetadata: Record<string, unknown> }) => Promise<unknown>;
};

export type UserProfile = {
  companyName: string;
  registrationNumber: string;
  postalCode: string;
  address: string;
  tel: string;
  fax: string;
  email: string;
  bankName: string;
  branchName: string;
  branchCode: string;
  accountType: string;
  accountNumber: string;
  accountHolder: string;
};

export const EMPTY_PROFILE: UserProfile = {
  companyName: "",
  registrationNumber: "",
  postalCode: "",
  address: "",
  tel: "",
  fax: "",
  email: "",
  bankName: "",
  branchName: "",
  branchCode: "",
  accountType: "普通",
  accountNumber: "",
  accountHolder: "",
};

export function readProfile(user: UserResource | null | undefined): UserProfile {
  const meta = (user?.unsafeMetadata ?? {}) as Partial<{ profile: Partial<UserProfile> }>;
  const p = meta.profile ?? {};
  return { ...EMPTY_PROFILE, ...p };
}

export function isProfileComplete(p: UserProfile): boolean {
  return Boolean(
    p.companyName.trim() &&
      p.postalCode.trim() &&
      p.address.trim() &&
      p.email.trim() &&
      p.bankName.trim() &&
      p.branchName.trim() &&
      p.accountType.trim() &&
      p.accountNumber.trim() &&
      p.accountHolder.trim(),
  );
}

export async function saveProfile(user: UserResource, profile: UserProfile): Promise<void> {
  const existing = (user.unsafeMetadata ?? {}) as Record<string, unknown>;
  await user.update({
    unsafeMetadata: { ...existing, profile },
  });
}
