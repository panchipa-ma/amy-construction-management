type TokenGetter = () => Promise<string | null>;

/**
 * Fetch an authenticated print document before navigating a new tab.
 *
 * A direct window.open() navigation cannot include the Clerk bearer token
 * that the API client attaches to fetch requests. Opening a blank tab first
 * keeps the browser's popup rules happy, then the authenticated response is
 * loaded from a blob URL.
 */
export async function openAuthenticatedPrintWindow({
  url,
  getToken,
}: {
  url: string;
  getToken: TokenGetter;
}): Promise<void> {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    throw new Error("印刷用ウィンドウを開けませんでした。ポップアップを許可してください。");
  }

  printWindow.document.title = "PDFを準備中";
  printWindow.document.body.innerHTML =
    '<p style="font-family:sans-serif;padding:24px">PDFを準備しています…</p>';

  try {
    const token = await getToken();
    const headers = new Headers({ Accept: "text/html" });
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }

    const response = await fetch(url, {
      credentials: "include",
      headers,
    });
    const html = await response.text();

    if (!response.ok) {
      let message = `PDF出力に失敗しました（${response.status}）`;
      try {
        const payload = JSON.parse(html) as { error?: unknown };
        if (typeof payload.error === "string" && payload.error) {
          message = payload.error;
        }
      } catch {
        // Keep the status-based message when the response is not JSON.
      }
      throw new Error(message);
    }

    const blobUrl = URL.createObjectURL(
      new Blob([html], { type: "text/html;charset=utf-8" }),
    );
    printWindow.addEventListener(
      "load",
      () => {
        window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
      },
      { once: true },
    );
    printWindow.location.replace(blobUrl);
  } catch (error) {
    printWindow.close();
    throw error;
  }
}