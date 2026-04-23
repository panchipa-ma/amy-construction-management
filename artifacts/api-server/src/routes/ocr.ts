import { Router, type IRouter, type Request, type Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { ExtractOcrBody, ExtractOcrResponse } from "@workspace/api-zod";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

const SYSTEM_PROMPT = `あなたは日本の領収書・請求書を読み取るOCRアシスタントです。
画像またはPDFから次の情報を抽出し、JSON形式のみで回答してください。説明文や前置きは不要です。

抽出フィールド:
- vendor: 店舗名・取引先名・職人名・会社名（最も主要な発行元）
- amount: 合計金額（税込）。¥や,を除いた数値のみ
- date: 領収日・請求日・発行日 (YYYY-MM-DD 形式)
- unitNumber: マンション号室の記載があれば（例: "305", "305号室"）。なければ null
- notes: 摘要・但し書き・補足。短く要約。なければ null
- confidence: 抽出の自信度 ("high" | "medium" | "low")

出力例:
{"vendor":"コーナン 東池袋店","amount":12480,"date":"2026-04-15","unitNumber":null,"notes":"クロス材料","confidence":"high"}`;

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

    const msg = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
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

    const result = ExtractOcrResponse.parse({
      vendor: String(data.vendor ?? "").trim(),
      amount: Number(data.amount ?? 0) || 0,
      date: String(data.date ?? new Date().toISOString().slice(0, 10)),
      unitNumber: data.unitNumber ? String(data.unitNumber).trim() : null,
      notes: data.notes ? String(data.notes).trim() : null,
      confidence: ["high", "medium", "low"].includes(data.confidence)
        ? data.confidence
        : "low",
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
