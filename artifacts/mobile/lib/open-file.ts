import * as Linking from "expo-linking";
import { Platform } from "react-native";

import { notify } from "./confirm";

/**
 * 相対 (`/api/storage/...`) または絶対 URL のファイルを開く。
 * Web は新規タブ、ネイティブはブラウザで開く。
 */
export async function openStorageFile(fileUrl: string): Promise<void> {
  const abs = absoluteUrl(fileUrl);
  if (!abs) {
    notify("ファイルを開けません", "ファイル URL が不正です。");
    return;
  }
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") {
      window.open(abs, "_blank", "noopener,noreferrer");
      return;
    }
  }
  await Linking.openURL(abs);
}

function absoluteUrl(u: string): string | null {
  if (!u) return null;
  if (/^https?:\/\//.test(u)) return u;
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (!domain) {
    // Web は現在のオリジンに対する相対 URL でブラウザが解決できるが、
    // ネイティブで bare な相対 URL を Linking に渡しても開けない。
    if (Platform.OS === "web" && typeof window !== "undefined") {
      return new URL(u, window.location.origin).toString();
    }
    return null;
  }
  const base = `https://${domain}`;
  if (u.startsWith("/")) return `${base}${u}`;
  return `${base}/${u}`;
}
