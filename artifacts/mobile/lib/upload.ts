import {
  extractOcr,
  requestUploadUrl,
  type ExtractOcrResponse,
} from "@workspace/api-client-react";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import { Alert, Platform } from "react-native";

export type UploadResult = {
  fileUrl: string;
  fileName: string;
  objectPath: string;
  contentType: string;
  width?: number;
  height?: number;
};

export type PickedAsset = {
  uri: string;
  fileName?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
  width?: number;
  height?: number;
};

/** カメラ直接起動 */
export async function pickFromCamera(): Promise<PickedAsset | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    Alert.alert("カメラ権限が必要です", "設定からカメラを許可してください");
    return null;
  }
  const r = await ImagePicker.launchCameraAsync({
    mediaTypes: ["images"],
    quality: 0.8,
    base64: false,
  });
  if (r.canceled || !r.assets?.[0]) return null;
  return r.assets[0];
}

/** 写真ライブラリから選択 */
export async function pickFromLibrary(): Promise<PickedAsset | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert("写真権限が必要です", "設定から写真へのアクセスを許可してください");
    return null;
  }
  const r = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 0.8,
    base64: false,
  });
  if (r.canceled || !r.assets?.[0]) return null;
  return r.assets[0];
}

/** ファイル (画像 or PDF) を選択 */
export async function pickFromFile(): Promise<PickedAsset | null> {
  const r = await DocumentPicker.getDocumentAsync({
    type: ["image/*", "application/pdf"],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (r.canceled || !r.assets?.[0]) return null;
  const a = r.assets[0];
  return {
    uri: a.uri,
    fileName: a.name,
    fileSize: a.size ?? null,
    mimeType: a.mimeType ?? null,
  };
}

/** 写真ライブラリ or ファイル選択 (アクションシート) */
export async function pickFromLibraryOrFile(): Promise<PickedAsset | null> {
  return new Promise((resolve) => {
    Alert.alert(
      "アップロード元を選択",
      undefined,
      [
        {
          text: "写真ライブラリ",
          onPress: async () => resolve(await pickFromLibrary()),
        },
        {
          text: "ファイルから選択",
          onPress: async () => resolve(await pickFromFile()),
        },
        { text: "キャンセル", style: "cancel", onPress: () => resolve(null) },
      ],
      { cancelable: true, onDismiss: () => resolve(null) },
    );
  });
}

/** @deprecated 後方互換: カメラ/ライブラリ選択シート */
export async function pickImage(): Promise<PickedAsset | null> {
  return new Promise((resolve) => {
    Alert.alert(
      "画像を選択",
      "撮影方法を選んでください",
      [
        {
          text: "カメラで撮影",
          onPress: async () => resolve(await pickFromCamera()),
        },
        {
          text: "写真ライブラリ / ファイル",
          onPress: async () => resolve(await pickFromLibraryOrFile()),
        },
        { text: "キャンセル", style: "cancel", onPress: () => resolve(null) },
      ],
      { cancelable: true, onDismiss: () => resolve(null) },
    );
  });
}

function guessContentType(uri: string, fallback?: string | null): string {
  if (fallback && fallback.includes("/")) return fallback;
  const lower = uri.split("?")[0].toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".heic") || lower.endsWith(".heif")) return "image/heic";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".pdf")) return "application/pdf";
  return "image/jpeg";
}

function fileNameFromUri(uri: string, fallback?: string | null): string {
  if (fallback) return fallback;
  const last = uri.split("/").pop() ?? "";
  const clean = last.split("?")[0];
  if (clean) return clean;
  return `upload-${Date.now()}.jpg`;
}

/**
 * Upload a local file URI to object storage via presigned PUT.
 * Returns the relative fileUrl (`/api/storage/objects/...`) suitable for
 * persistence in DB columns like `receipts.fileUrl`.
 */
export async function uploadAsset(asset: {
  uri: string;
  fileName?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
  width?: number;
  height?: number;
}): Promise<UploadResult> {
  const contentType = guessContentType(asset.uri, asset.mimeType);
  const fileName = fileNameFromUri(asset.uri, asset.fileName);

  let size = asset.fileSize ?? 0;
  if (!size && asset.uri.startsWith("file://")) {
    try {
      const info = await FileSystem.getInfoAsync(asset.uri);
      size = (info as { size?: number }).size ?? 0;
    } catch {
      /* ignore */
    }
  }

  const reqRes = await requestUploadUrl({
    name: fileName,
    size: size > 0 ? size : 1,
    contentType,
  });

  // Stream the file from disk to avoid loading large photos fully into memory.
  if (asset.uri.startsWith("file://")) {
    const upload = await FileSystem.uploadAsync(reqRes.uploadURL, asset.uri, {
      httpMethod: "PUT",
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: { "Content-Type": contentType },
    });
    if (upload.status < 200 || upload.status >= 300) {
      throw new Error(`アップロードに失敗しました (HTTP ${upload.status})`);
    }
  } else {
    const blob = await fetch(asset.uri).then((r) => r.blob());
    const putRes = await fetch(reqRes.uploadURL, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: blob,
    });
    if (!putRes.ok) {
      throw new Error(`アップロードに失敗しました (HTTP ${putRes.status})`);
    }
  }

  return {
    fileUrl: `/api/storage${reqRes.objectPath}`,
    fileName,
    objectPath: reqRes.objectPath,
    contentType,
    width: asset.width,
    height: asset.height,
  };
}

/**
 * After upload, call /api/ocr/extract to autofill vendor / amount / date / 号室.
 * Errors are returned as null so the caller can keep going (manual entry).
 */
export async function tryOcr(
  objectPath: string,
  contentType: string,
  kind: "receipt" | "vendor_invoice",
): Promise<ExtractOcrResponse | null> {
  try {
    const r = await extractOcr({
      objectPath,
      contentType,
      kind,
    });
    return r;
  } catch (err) {
    if (Platform.OS !== "web") {
      console.warn("[ocr] extract failed", err);
    }
    return null;
  }
}

/** High-level helper: pick → upload → OCR. Returns null if user cancels. */
export async function pickUploadAndOcr(
  kind: "receipt" | "vendor_invoice",
  source: "camera" | "library-or-file" = "library-or-file",
): Promise<{ upload: UploadResult; ocr: ExtractOcrResponse | null } | null> {
  const asset =
    source === "camera" ? await pickFromCamera() : await pickFromLibraryOrFile();
  if (!asset) return null;
  const upload = await uploadAsset(asset);
  const ocr = await tryOcr(upload.objectPath, upload.contentType, kind);
  return { upload, ocr };
}
