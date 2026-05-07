import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, companyProfileTable } from "@workspace/db";
import {
  GetCompanyProfileResponse,
  UpdateCompanyProfileBody,
  UpdateCompanyProfileResponse,
} from "@workspace/api-zod";
import { requireInternal } from "../lib/auth";

const router: IRouter = Router();

const SINGLETON_ID = "default";

const DEFAULTS = {
  id: SINGLETON_ID,
  name: "株式会社AMY",
  postalCode: "〒570-0000",
  address: "大阪府守口市大枝東町5-10",
  registrationNumber: "T8120001231483",
  tel: "06-6780-9124",
  fax: "06-6780-9125",
  email: "info@amy0901-c.com",
  contact: "山本",
  bankName: "三井住友銀行",
  branchName: "守口市駅前出張所",
  branchCode: "197",
  accountType: "普通",
  accountNumber: "0543222",
  accountHolder: "株式会社AMY カエーエムワイ",
  termsDelivery: "別途ご相談",
  termsPayment: "別途ご相談",
  termsValidity: "御見積後4週間",
};

function serialize(row: typeof companyProfileTable.$inferSelect) {
  return {
    name: row.name,
    postalCode: row.postalCode,
    address: row.address,
    registrationNumber: row.registrationNumber,
    tel: row.tel,
    fax: row.fax,
    email: row.email,
    contact: row.contact,
    bankName: row.bankName,
    branchName: row.branchName,
    branchCode: row.branchCode,
    accountType: row.accountType,
    accountNumber: row.accountNumber,
    accountHolder: row.accountHolder,
    termsDelivery: row.termsDelivery,
    termsPayment: row.termsPayment,
    termsValidity: row.termsValidity,
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function readOrSeed() {
  // Atomic seed: insert defaults if missing, otherwise no-op. Then re-select.
  // Avoids the check-then-insert race on the very first concurrent GET.
  await db
    .insert(companyProfileTable)
    .values(DEFAULTS)
    .onConflictDoNothing({ target: companyProfileTable.id });
  const [row] = await db
    .select()
    .from(companyProfileTable)
    .where(eq(companyProfileTable.id, SINGLETON_ID));
  return row;
}

router.get("/company-profile", async (_req, res): Promise<void> => {
  const row = await readOrSeed();
  res.json(GetCompanyProfileResponse.parse(serialize(row)));
});

router.put(
  "/company-profile",
  requireInternal,
  async (req, res): Promise<void> => {
    const parsed = UpdateCompanyProfileBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    await readOrSeed();
    const [updated] = await db
      .update(companyProfileTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(companyProfileTable.id, SINGLETON_ID))
      .returning();
    res.json(UpdateCompanyProfileResponse.parse(serialize(updated)));
  },
);

export default router;
