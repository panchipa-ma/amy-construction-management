import { Router, type IRouter, type Request, type Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { ExtractOcrBody, ExtractOcrResponse } from "@workspace/api-zod";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

const SYSTEM_PROMPT_RECEIPT = `あなたは日本の領収書を読み取るOCRアシスタントです。
画像またはPDFから次の情報を抽出し、JSON形式のみで回答してください。説明文や前置きは不要です。

抽出フィールド:
- vendor: 店舗名・取引先名（発行元）
- amount: 合計金額（税込）。¥や,を除いた数値のみ
- date: 領収日 (YYYY-MM-DD 形式)
- unitNumber: マンション号室の記載があれば（例: "305", "305号室"）。なければ null
- notes: 摘要・但し書き・補足。短く要約。なければ null
- confidence: "high" | "medium" | "low"
- items: 領収書では空配列 []

出力例:
{"vendor":"コーナン 東池袋店","amount":12480,"date":"2026-04-15","unitNumber":null,"notes":"クロス材料","confidence":"high","items":[]}`;

const SYSTEM_PROMPT_INVOICE = `あなたは日本の職人・業者請求書を読み取るOCRアシスタントです。
1枚の請求書に複数の物件（号室）の作業がまとめて記載されている場合があります。
画像またはPDFから情報を抽出し、JSON形式のみで回答してください。説明文や前置きは不要です。

抽出フィールド:
- vendor: 請求元の職人名・会社名（発行元、自社ではなく相手）
- amount: 請求書全体の合計金額（税込）
- date: 請求日 / 発行日 (YYYY-MM-DD 形式)
- unitNumber: 単一物件の場合の号室。複数物件なら null
- notes: 全体の摘要・件名。なければ null
- confidence: "high" | "medium" | "low"
- items: 物件ごとの内訳（必須）。各要素 {unitNumber, amount, description?, date?}
  - unitNumber: マンション号室（例: "305"）。号室記載がない行は除外
  - amount: その物件の請求金額（税込）。複数行をまとめても可
  - description: 作業内容（クロス張替、CF等）
  - date: 作業日 (YYYY-MM-DD)。なければ請求日と同じで可
  - 単一物件の場合も items は1要素入れる

例（複数物件）:
{"vendor":"山田内装","amount":285000,"date":"2026-04-20","unitNumber":null,"notes":null,"confidence":"high","items":[
  {"unitNumber":"305","amount":120000,"description":"クロス張替 一式","date":"2026-04-15"},
  {"unitNumber":"402","amount":85000,"description":"CF貼替","date":"2026-04-17"},
  {"unitNumber":"501","amount":80000,"description":"クロス補修","date":"2026-04-18"}
]}`;

async function readFileBytes(objectPath: string): Promise<{ bytes: Buffer; contentType: string }> {
  const file = await objectStorageService.getObjectEntityFile(objectPath);
  const [metadata] = await file.getMetadata();
  const contentType = (metadata.contentType as string) || "application/octet-stream";
  const [buf] = await file.download();
  return { bytes: buf, contentType };
}

router.post("/ocr/extract", async (req: Request, res: Response) => {
  const parsed = ExtractOcrBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid required fields" });
    return;
  }

  const baseURL = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
  if (!baseURL || !apiKey) {
    req.log.error("Anthropic AI integration env vars missing");
    res.status(500).json({ error: "OCR service not configured" });
    return;
  }

  try {
    const { objectPath } = parsed.data;
    const { bytes, contentType: storedContentType } = await readFileBytes(objectPath);
    const contentType = parsed.data.contentType ?? storedContentType;
    const base64 = bytes.toString("base64");

    const isPdf = contentType.includes("pdf");
    const isImage = contentType.startsWith("image/");
    if (!isPdf && !isImage) {
      res.status(400).json({ error: `Unsupported file type: ${contentType}` });
      return;
    }

    const client = new Anthropic({ baseURL, apiKey });
    const documentBlock = isPdf
      ? {
          type: "document" as const,
          source: {
            type: "base64" as const,
            media_type: "application/pdf" as const,
            data: base64,
          },
        }
      : {
          type: "image" as const,
          source: {
            type: "base64" as const,
            media_type: contentType as
              | "image/jpeg"
              | "image/png"
              | "image/gif"
              | "image/webp",
            data: base64,
          },
        };

    const isInvoice = parsed.data.kind === "vendor_invoice";
    const msg = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: isInvoice ? 4096 : 1024,
      system: isInvoice ? SYSTEM_PROMPT_INVOICE : SYSTEM_PROMPT_RECEIPT,
      messages: [
        {
          role: "user",
          content: [
            documentBlock,
            {
              type: "text",
              text: "この書類から指定フィールドをJSONのみで抽出してください。",
            },
          ],
        },
      ],
    });

    const textBlock = msg.content.find((b) => b.type === "text");
    const raw = textBlock && textBlock.type === "text" ? textBlock.text : "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      req.log.error({ raw }, "OCR did not return JSON");
      res.status(502).json({ error: "OCR did not return structured data" });
      return;
    }
    const data = JSON.parse(jsonMatch[0]);

    const fallbackDate = String(
      data.date ?? new Date().toISOString().slice(0, 10),
    );
    const rawItems = Array.isArray(data.items) ? data.items : [];
    const items = rawItems
      .map((it: Record<string, unknown>) => ({
        unitNumber: String(it.unitNumber ?? "").trim(),
        amount: Number(it.amount ?? 0) || 0,
        description: it.description ? String(it.description).trim() : null,
        date: it.date ? String(it.date).trim() : null,
      }))
      .filter((it: { unitNumber: string }) => it.unitNumber !== "");

    const result = ExtractOcrResponse.parse({
      vendor: String(data.vendor ?? "").trim(),
      amount: Number(data.amount ?? 0) || 0,
      date: fallbackDate,
      unitNumber: data.unitNumber ? String(data.unitNumber).trim() : null,
      notes: data.notes ? String(data.notes).trim() : null,
      confidence: ["high", "medium", "low"].includes(data.confidence)
        ? data.confidence
        : "low",
      items,
    });

    res.json(result);
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "File not found" });
      return;
    }
    req.log.error({ err: error }, "OCR extraction failed");
    res.status(500).json({ error: "OCR extraction failed" });
  }
});

export default router;
