import { useGetCompanyProfile } from "@workspace/api-client-react";

export type CompanyInfo = {
  name: string;
  postalCode: string;
  address: string;
  registrationNumber: string;
  tel: string;
  fax: string;
  email: string;
  contact: string;
};

export type BankInfo = {
  bankName: string;
  branchName: string;
  branchCode: string;
  accountType: string;
  accountNumber: string;
  accountHolder: string;
};

export type QuoteTerms = {
  delivery: string;
  payment: string;
  validity: string;
};

// Fallback used while the GET /company-profile request is in flight (or in
// the rare case it fails). Once the row is fetched these values are
// overridden by whatever is in the DB; the actual editable record is seeded
// from the same defaults on the server.
export const COMPANY_INFO: CompanyInfo = {
  name: "株式会社AMY",
  postalCode: "〒570-0000",
  address: "大阪府守口市大枝東町5-10",
  registrationNumber: "T8120001231483",
  tel: "06-6780-9124",
  fax: "06-6780-9125",
  email: "info@amy0901-c.com",
  contact: "山本",
};

export const BANK_INFO: BankInfo = {
  bankName: "三井住友銀行",
  branchName: "守口市駅前出張所",
  accountType: "普通",
  branchCode: "197",
  accountNumber: "0543222",
  accountHolder: "株式会社AMY カエーエムワイ",
};

export const QUOTE_TERMS: QuoteTerms = {
  delivery: "別途ご相談",
  payment: "別途ご相談",
  validity: "御見積後4週間",
};

export function useCompanyInfo(): CompanyInfo {
  const { data } = useGetCompanyProfile();
  if (!data) return COMPANY_INFO;
  return {
    name: data.name || COMPANY_INFO.name,
    postalCode: data.postalCode || COMPANY_INFO.postalCode,
    address: data.address || COMPANY_INFO.address,
    registrationNumber:
      data.registrationNumber || COMPANY_INFO.registrationNumber,
    tel: data.tel || COMPANY_INFO.tel,
    fax: data.fax || COMPANY_INFO.fax,
    email: data.email || COMPANY_INFO.email,
    contact: data.contact || COMPANY_INFO.contact,
  };
}

export function useBankInfo(): BankInfo {
  const { data } = useGetCompanyProfile();
  if (!data) return BANK_INFO;
  return {
    bankName: data.bankName || BANK_INFO.bankName,
    branchName: data.branchName || BANK_INFO.branchName,
    branchCode: data.branchCode || BANK_INFO.branchCode,
    accountType: data.accountType || BANK_INFO.accountType,
    accountNumber: data.accountNumber || BANK_INFO.accountNumber,
    accountHolder: data.accountHolder || BANK_INFO.accountHolder,
  };
}

export function useQuoteTerms(): QuoteTerms {
  const { data } = useGetCompanyProfile();
  if (!data) return QUOTE_TERMS;
  return {
    delivery: data.termsDelivery || QUOTE_TERMS.delivery,
    payment: data.termsPayment || QUOTE_TERMS.payment,
    validity: data.termsValidity || QUOTE_TERMS.validity,
  };
}
