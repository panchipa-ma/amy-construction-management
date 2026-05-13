import { requestUploadUrl } from "@workspace/api-client-react";
import * as FileSystem from "expo-file-system/legacy";
import * as Print from "expo-print";
import { Platform } from "react-native";

import type { UserProfile } from "./profile";

export type VendorDocItem = { description: string; quantity: number; unitPrice: number };

export type VendorDocInput = {
  kind: "invoice" | "quote";
  docNumber: string;
  issueDate: string;
  validUntilOrDue?: string | null;
  recipientName: string;
  recipientContactName: string;
  authorName: string;
  subject: string;
  items: VendorDocItem[];
  notes: string;
  profile: UserProfile;
};

const fmtCurrency = (n: number) =>
  `¥${Math.round(n).toLocaleString("ja-JP")}`;

const fmtDate = (s: string) => {
  if (!s) return "";
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
};

function buildHtml(input: VendorDocInput): string {
  const subtotal = input.items.reduce(
    (s, it) => s + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0),
    0,
  );
  const tax = Math.round(subtotal * 0.1);
  const total = subtotal + tax;
  const title = input.kind === "invoice" ? "請　求　書" : "御　見　積　書";
  const numberLabel = input.kind === "invoice" ? "請求No." : "見積No.";
  const dateLabel = input.kind === "invoice" ? "請求日" : "見積日";
  const validLabel = input.kind === "invoice" ? "お支払期限" : "有効期限";
  const p = input.profile;

  const itemRows = input.items
    .map((it) => {
      const amount = (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0);
      return `
        <tr>
          <td style="padding:6px 8px;border:1px solid #cbd5e1;">${escapeHtml(it.description)}</td>
          <td style="padding:6px 8px;border:1px solid #cbd5e1;text-align:right;font-variant-numeric:tabular-nums;">${
            Number(it.quantity) || 0
          }</td>
          <td style="padding:6px 8px;border:1px solid #cbd5e1;text-align:right;font-variant-numeric:tabular-nums;">${fmtCurrency(
            Number(it.unitPrice) || 0,
          )}</td>
          <td style="padding:6px 8px;border:1px solid #cbd5e1;text-align:right;font-variant-numeric:tabular-nums;">${fmtCurrency(
            amount,
          )}</td>
        </tr>`;
    })
    .join("");

  // Pad to at least 10 rows for layout
  const padCount = Math.max(0, 10 - input.items.length);
  const padRows = Array.from({ length: padCount })
    .map(
      () =>
        `<tr><td style="padding:6px 8px;border:1px solid #cbd5e1;">&nbsp;</td><td style="border:1px solid #cbd5e1;"></td><td style="border:1px solid #cbd5e1;"></td><td style="border:1px solid #cbd5e1;"></td></tr>`,
    )
    .join("");

  return `<!doctype html>
<html><head><meta charset="utf-8" />
<style>
  @page { size: A4; margin: 12mm; }
  body { font-family: -apple-system, "Hiragino Kaku Gothic ProN", "Yu Gothic", Meiryo, sans-serif; color: #0f172a; font-size: 12px; }
  h1 { text-align:center; letter-spacing:0.5em; font-size:22px; margin: 0 0 18px; }
  table { border-collapse: collapse; width: 100%; }
</style>
</head>
<body>
<h1>${title}</h1>
<table style="width:100%;margin-bottom:14px;">
  <tr>
    <td style="vertical-align:top;width:60%;">
      <div style="font-size:16px;font-weight:700;border-bottom:1px solid #0f172a;display:inline-block;padding-bottom:2px;min-width:200px;">
        ${escapeHtml(input.recipientName || "—")} <span style="font-size:14px;font-weight:500;">御中</span>
      </div>
      <div style="margin-top:10px;">ご担当：${
        input.recipientContactName ? escapeHtml(input.recipientContactName) + " 様" : ""
      }</div>
      <div style="margin-top:8px;">件名：<b>${escapeHtml(input.subject)}</b></div>
      <div style="margin-top:10px;">下記の通り、${
        input.kind === "invoice" ? "ご請求" : "御見積"
      }申し上げます。</div>
    </td>
    <td style="vertical-align:top;text-align:right;">
      <div>${numberLabel} ${escapeHtml(input.docNumber)}</div>
      <div>${dateLabel} ${fmtDate(input.issueDate)}</div>
      <div style="margin-top:10px;border-top:1px solid #e2e8f0;padding-top:8px;text-align:left;">
        <div style="font-weight:700;">${escapeHtml(p.companyName || "—")}</div>
        ${p.postalCode ? `<div>〒${escapeHtml(p.postalCode)}</div>` : ""}
        ${p.address ? `<div>${escapeHtml(p.address)}</div>` : ""}
        ${
          p.registrationNumber
            ? `<div>登録番号：T${escapeHtml(p.registrationNumber.replace(/^T/i, ""))}</div>`
            : ""
        }
        ${p.tel ? `<div>TEL：${escapeHtml(p.tel)}</div>` : ""}
        ${p.fax ? `<div>FAX：${escapeHtml(p.fax)}</div>` : ""}
        ${p.email ? `<div>E-Mail：${escapeHtml(p.email)}</div>` : ""}
        ${input.authorName ? `<div style="margin-top:4px;">担当：${escapeHtml(input.authorName)}</div>` : ""}
      </div>
    </td>
  </tr>
</table>
<div style="border-top:2px solid #0f172a;border-bottom:2px solid #0f172a;padding:8px 4px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;">
  <div><b style="font-size:14px;">合計金額</b> <b style="font-size:20px;font-variant-numeric:tabular-nums;">${fmtCurrency(
    total,
  )}</b> <span style="font-size:11px;">（税込）</span></div>
  ${
    input.validUntilOrDue
      ? `<div>${validLabel}：<b>${fmtDate(input.validUntilOrDue)}</b></div>`
      : ""
  }
</div>
<table>
  <thead>
    <tr style="background:#f1f5f9;">
      <th style="padding:6px 8px;border:1px solid #cbd5e1;text-align:left;">工事項目 / 摘要</th>
      <th style="padding:6px 8px;border:1px solid #cbd5e1;width:60px;">数量</th>
      <th style="padding:6px 8px;border:1px solid #cbd5e1;width:90px;">単価</th>
      <th style="padding:6px 8px;border:1px solid #cbd5e1;width:100px;">金額</th>
    </tr>
  </thead>
  <tbody>${itemRows}${padRows}</tbody>
</table>
<table style="margin-top:14px;width:auto;margin-left:auto;">
  <tr><td style="padding:4px 12px;text-align:right;">小計</td><td style="padding:4px 12px;text-align:right;font-variant-numeric:tabular-nums;">${fmtCurrency(
    subtotal,
  )}</td></tr>
  <tr><td style="padding:4px 12px;text-align:right;">消費税 (10%)</td><td style="padding:4px 12px;text-align:right;font-variant-numeric:tabular-nums;">${fmtCurrency(
    tax,
  )}</td></tr>
  <tr><td style="padding:6px 12px;text-align:right;font-weight:700;border-top:1px solid #0f172a;">合計</td><td style="padding:6px 12px;text-align:right;font-weight:700;border-top:1px solid #0f172a;font-variant-numeric:tabular-nums;">${fmtCurrency(
    total,
  )}</td></tr>
</table>
${
  input.kind === "invoice"
    ? `<div style="margin-top:18px;border:1px solid #cbd5e1;padding:10px;">
  <div style="font-weight:700;margin-bottom:4px;">お振込先</div>
  <div>${escapeHtml(p.bankName)} ${escapeHtml(p.branchName)} ${
    p.branchCode ? `(${escapeHtml(p.branchCode)})` : ""
  }</div>
  <div>${escapeHtml(p.accountType)} ${escapeHtml(p.accountNumber)}</div>
  <div>${escapeHtml(p.accountHolder)}</div>
</div>`
    : ""
}
${
  input.notes
    ? `<div style="margin-top:14px;"><b>備考</b><div style="white-space:pre-wrap;">${escapeHtml(
        input.notes,
      )}</div></div>`
    : ""
}
</body></html>`;
}

function escapeHtml(s: string): string {
  return (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Generate a PDF, upload via /api/storage signed URL, return objectPath.
 *
 * Platform 別:
 * - native (iOS/Android): expo-print の printToFileAsync で PDF 化
 * - web: expo-print は web で動かないので html2canvas-pro + jsPDF で
 *        hidden iframe を経由して PDF Blob を生成。
 */
export async function generateAndUploadVendorDoc(
  input: VendorDocInput,
  fileNameBase: string,
): Promise<{ fileUrl: string; fileName: string }> {
  const html = buildHtml(input);
  const fileName = `${fileNameBase}.pdf`;

  let blob: Blob;
  if (Platform.OS === "web") {
    blob = await renderHtmlToPdfBlob(html);
  } else {
    const { uri } = await Print.printToFileAsync({ html, base64: false });
    blob = await fetch(uri).then((r) => r.blob());
    // info is fetched only to surface obvious file IO errors early
    await FileSystem.getInfoAsync(uri);
  }

  const reqRes = await requestUploadUrl({
    name: fileName,
    size: blob.size > 0 ? blob.size : 1,
    contentType: "application/pdf",
  });

  const putRes = await fetch(reqRes.uploadURL, {
    method: "PUT",
    headers: { "Content-Type": "application/pdf" },
    body: blob,
  });
  if (!putRes.ok) throw new Error(`PDFアップロード失敗 (HTTP ${putRes.status})`);

  return {
    fileUrl: `/api/storage${reqRes.objectPath}`,
    fileName,
  };
}

/**
 * Web 専用: HTML 文字列 → PDF Blob。
 * iframe srcdoc で完全な document としてレンダリング → html2canvas-pro でキャプチャ
 * → jsPDF で A4 PDF に。複数ページ対応。
 */
async function renderHtmlToPdfBlob(html: string): Promise<Blob> {
  const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
    import("html2canvas-pro"),
    import("jspdf"),
  ]);

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.left = "-100000px";
  iframe.style.top = "0";
  iframe.style.width = "794px";
  iframe.style.height = "1123px";
  iframe.style.border = "0";
  iframe.setAttribute("aria-hidden", "true");
  document.body.appendChild(iframe);

  try {
    await new Promise<void>((resolve) => {
      iframe.addEventListener("load", () => resolve(), { once: true });
      iframe.srcdoc = html;
      setTimeout(resolve, 3000);
    });

    const doc = iframe.contentDocument;
    if (!doc) throw new Error("iframe document が取得できません");

    try {
      await doc.fonts?.ready;
    } catch {
      /* ignore */
    }
    await new Promise((r) => setTimeout(r, 200));

    const target = doc.body;
    const fullHeight = Math.max(
      target.scrollHeight,
      doc.documentElement.scrollHeight,
      1123,
    );
    iframe.style.height = `${fullHeight}px`;
    await new Promise((r) => setTimeout(r, 100));

    const canvas = await html2canvas(target, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      windowWidth: 794,
      windowHeight: fullHeight,
    });

    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    const pageWidthMm = 210;
    const pageHeightMm = 297;
    const imgHeightMm = (canvas.height * pageWidthMm) / canvas.width;

    if (imgHeightMm <= pageHeightMm) {
      const imgData = canvas.toDataURL("image/jpeg", 0.95);
      pdf.addImage(imgData, "JPEG", 0, 0, pageWidthMm, imgHeightMm);
    } else {
      const pxPerMm = canvas.width / pageWidthMm;
      const pageCanvasHeight = Math.floor(pageHeightMm * pxPerMm);
      let yOffset = 0;
      let pageNum = 0;
      while (yOffset < canvas.height) {
        const sliceHeight = Math.min(pageCanvasHeight, canvas.height - yOffset);
        const slice = document.createElement("canvas");
        slice.width = canvas.width;
        slice.height = sliceHeight;
        const ctx = slice.getContext("2d");
        if (!ctx) throw new Error("canvas context が取得できません");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, slice.width, slice.height);
        ctx.drawImage(
          canvas,
          0,
          yOffset,
          canvas.width,
          sliceHeight,
          0,
          0,
          canvas.width,
          sliceHeight,
        );
        const sliceData = slice.toDataURL("image/jpeg", 0.95);
        const sliceHeightMm = (sliceHeight * pageWidthMm) / canvas.width;
        if (pageNum > 0) pdf.addPage();
        pdf.addImage(sliceData, "JPEG", 0, 0, pageWidthMm, sliceHeightMm);
        yOffset += sliceHeight;
        pageNum += 1;
      }
    }

    return pdf.output("blob");
  } finally {
    iframe.remove();
  }
}
