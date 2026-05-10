/**
 * 株式会社AMY 会社・銀行情報。Web (`artifacts/amy/src/lib/company-info.ts`)
 * と完全に一致させること。両者で書類の発行元/振込先が同一になることを保証する。
 */
export const COMPANY_INFO = {
  name: "株式会社AMY",
  postalCode: "〒570-0036",
  address: "大阪府守口市大枝東町5-10",
  registrationNumber: "T8120001231483",
  tel: "06-6780-9124",
  fax: "06-6780-9125",
  email: "info@amy0901-c.com",
  contact: "山本",
};

export const BANK_INFO = {
  bankName: "三井住友銀行",
  branchName: "守口市駅前出張所",
  accountType: "普通",
  branchCode: "197",
  accountNumber: "0543222",
  accountHolder: "株式会社AMY カエーエムワイ",
};

export const QUOTE_TERMS = {
  delivery: "別途ご相談",
  payment: "別途ご相談",
  validity: "御見積後4週間",
};
