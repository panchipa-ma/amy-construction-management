import { Alert, Platform } from "react-native";

/**
 * クロスプラットフォーム確認ダイアログ。
 *
 * React Native の `Alert.alert` は Expo Web では `window.alert` にフォールバックし、
 * ボタンの onPress コールバックが発火しない (well-known limitation)。
 * 本ヘルパーは Web では `window.confirm`、ネイティブでは `Alert.alert` を使い分けて
 * **必ず boolean を返す** (true=確定 / false=キャンセル)。
 *
 * 使い方:
 *   if (await confirmDestructive({ title, message, confirmLabel: "削除する" })) {
 *     await doDelete();
 *   }
 */
export function confirmDestructive(opts: {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}): Promise<boolean> {
  const {
    title,
    message,
    confirmLabel = "削除する",
    cancelLabel = "キャンセル",
  } = opts;

  if (Platform.OS === "web") {
    const text = message ? `${title}\n\n${message}` : title;
    // window.confirm は同期だが Promise で揃えて返す。
    const ok =
      typeof window !== "undefined" && typeof window.confirm === "function"
        ? window.confirm(text)
        : false;
    return Promise.resolve(ok);
  }

  return new Promise<boolean>((resolve) => {
    Alert.alert(title, message, [
      { text: cancelLabel, style: "cancel", onPress: () => resolve(false) },
      {
        text: confirmLabel,
        style: "destructive",
        onPress: () => resolve(true),
      },
    ]);
  });
}

/** 通常の確認 (破壊的でない、デフォルト OK ラベル)。 */
export function confirmAction(opts: {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}): Promise<boolean> {
  const {
    title,
    message,
    confirmLabel = "OK",
    cancelLabel = "キャンセル",
  } = opts;

  if (Platform.OS === "web") {
    const text = message ? `${title}\n\n${message}` : title;
    const ok =
      typeof window !== "undefined" && typeof window.confirm === "function"
        ? window.confirm(text)
        : false;
    return Promise.resolve(ok);
  }

  return new Promise<boolean>((resolve) => {
    Alert.alert(title, message, [
      { text: cancelLabel, style: "cancel", onPress: () => resolve(false) },
      { text: confirmLabel, onPress: () => resolve(true) },
    ]);
  });
}

/** エラー/情報通知 (Web は alert、ネイティブは Alert.alert)。 */
export function notify(title: string, message?: string): void {
  if (Platform.OS === "web") {
    const text = message ? `${title}\n\n${message}` : title;
    if (typeof window !== "undefined" && typeof window.alert === "function") {
      window.alert(text);
    } else {
      console.warn("[notify]", title, message);
    }
    return;
  }
  Alert.alert(title, message);
}
