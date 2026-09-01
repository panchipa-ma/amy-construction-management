/**
 * Fetch a same-origin print document before navigating a new tab.
 *
 * Opening a blank tab first keeps the browser's popup rules happy, then the
 * response is loaded from a blob URL after the browser sends its Clerk session
 * cookie with the authenticated fetch.
 */
export async function openAuthenticatedPrintWindow({
  url,
}: {
  url: string;
}): Promise<void> {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    throw new Error("印刷用ウィンドウを開けませんでした。ポップアップを許可してください。");
  }

  printWindow.document.title = "PDFを準備中";
  printWindow.document.body.innerHTML =
    '<p style="font-family:sans-serif;padding:24px">PDFを準備しています…</p>';

  try {
    const html = await fetchAuthenticatedPrintHtml(url);

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

export async function shareAuthenticatedPrintPdf({
  url,
  fileName,
}: {
  url: string;
  fileName: string;
}): Promise<void> {
  const html = await fetchAuthenticatedPrintHtml(url);
  const pdfBlob = await renderPrintHtmlToPdfBlob(html);
  const nav = typeof navigator !== "undefined" ? navigator : undefined;

  if (nav?.share && nav.canShare && typeof File !== "undefined") {
    const file = new File([pdfBlob], fileName, { type: "application/pdf" });
    const shareData: ShareData = { files: [file], title: fileName };
    if (nav.canShare(shareData)) {
      try {
        await nav.share(shareData);
        return;
      } catch (error) {
        if ((error as { name?: string })?.name === "AbortError") return;
      }
    }
  }

  // Browsers without Web Share file support still receive the PDF itself,
  // rather than the authenticated HTML URL.
  const downloadUrl = URL.createObjectURL(pdfBlob);
  const anchor = document.createElement("a");
  anchor.href = downloadUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 60_000);
}

async function fetchAuthenticatedPrintHtml(
  url: string,
): Promise<string> {
  const response = await fetch(url, {
    credentials: "include",
    headers: new Headers({ Accept: "text/html" }),
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
  return html;
}

async function renderPrintHtmlToPdfBlob(html: string): Promise<Blob> {
  const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
    import("html2canvas-pro"),
    import("jspdf"),
  ]);

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.left = "-100000px";
  iframe.style.top = "0";
  iframe.style.width = "794px";
  iframe.style.height = "800px";
  iframe.style.border = "0";
  iframe.setAttribute("aria-hidden", "true");
  document.body.appendChild(iframe);

  try {
    await new Promise<void>((resolve, reject) => {
      iframe.addEventListener("load", () => resolve(), { once: true });
      iframe.addEventListener(
        "error",
        () => reject(new Error("PDFレンダリングに失敗しました")),
        { once: true },
      );
      iframe.srcdoc = html;
      window.setTimeout(resolve, 3_000);
    });

    const doc = iframe.contentDocument;
    if (!doc) throw new Error("PDFレンダリング用の文書を取得できません");
    try {
      await doc.fonts?.ready;
    } catch {
      // Continue with the browser's fallback font.
    }
    await new Promise((resolve) => window.setTimeout(resolve, 200));

    const target = doc.body;
    const contentWidth = Math.max(
      794,
      target.scrollWidth,
      doc.documentElement.scrollWidth,
    );
    iframe.style.width = `${contentWidth}px`;
    const fullHeight = Math.max(
      target.scrollHeight,
      doc.documentElement.scrollHeight,
      1,
    );
    iframe.style.height = `${fullHeight}px`;
    await new Promise((resolve) => window.setTimeout(resolve, 100));

    const canvas = await html2canvas(target, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      windowWidth: contentWidth,
      windowHeight: fullHeight,
    });

    const format = contentWidth > 1200 ? "a3" : "a4";
    const pageWidthMm = format === "a3" ? 420 : 297;
    const pageHeightMm = format === "a3" ? 297 : 210;
    const pdf = new jsPDF({
      unit: "mm",
      format,
      orientation: "landscape",
    });
    const imageHeightMm = (canvas.height * pageWidthMm) / canvas.width;

    if (imageHeightMm <= pageHeightMm) {
      pdf.addImage(
        canvas.toDataURL("image/jpeg", 0.95),
        "JPEG",
        0,
        0,
        pageWidthMm,
        imageHeightMm,
      );
    } else {
      const pixelsPerMm = canvas.width / pageWidthMm;
      const pageCanvasHeight = Math.floor(pageHeightMm * pixelsPerMm);
      let yOffset = 0;
      let pageNumber = 0;
      while (yOffset < canvas.height) {
        const sliceHeight = Math.min(pageCanvasHeight, canvas.height - yOffset);
        const slice = document.createElement("canvas");
        slice.width = canvas.width;
        slice.height = sliceHeight;
        const context = slice.getContext("2d");
        if (!context) throw new Error("PDF画像の描画に失敗しました");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, slice.width, slice.height);
        context.drawImage(
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
        if (pageNumber > 0) pdf.addPage();
        pdf.addImage(
          slice.toDataURL("image/jpeg", 0.95),
          "JPEG",
          0,
          0,
          pageWidthMm,
          (sliceHeight * pageWidthMm) / canvas.width,
        );
        yOffset += sliceHeight;
        pageNumber += 1;
      }
    }

    return pdf.output("blob");
  } finally {
    iframe.remove();
  }
}