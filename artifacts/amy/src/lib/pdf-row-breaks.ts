import type jsPDF from "jspdf";

/**
 * Add a captured html2canvas canvas to a jsPDF document, splitting at
 * row boundaries (elements marked with `data-pdf-row="true"`) so a row is
 * never torn in half across pages. Width is rendered at full A4 width
 * (no scale-down). Quality: JPEG 92.
 */
export function addCanvasToPdfWithRowBreaks(
  pdf: jsPDF,
  canvas: HTMLCanvasElement,
  printEl: HTMLElement,
): void {
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const imgW = pageW;
  const fullImgH = (canvas.height * imgW) / canvas.width;

  // Effective content height: ignore any trailing whitespace below the last
  // visible element (prevents a blank trailing page when the captured canvas
  // is slightly taller than the actual content).
  const printRect = printEl.getBoundingClientRect();
  const scaleY = canvas.height / printRect.height;
  let contentBottomPx = canvas.height;
  const allEls = printEl.querySelectorAll<HTMLElement>("*");
  let maxBottom = 0;
  allEls.forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    const b = (r.bottom - printRect.top) * scaleY;
    if (b > maxBottom && b <= canvas.height) maxBottom = b;
  });
  if (maxBottom > 0) {
    // +8px breathing room for descenders / sub-pixel rounding
    contentBottomPx = Math.min(canvas.height, Math.ceil(maxBottom + 8));
  }
  const effectiveImgH = (contentBottomPx * imgW) / canvas.width;

  // Single-page fast path (3mm tolerance for rounding).
  if (effectiveImgH <= pageH + 3) {
    const sliceCanvas = document.createElement("canvas");
    sliceCanvas.width = canvas.width;
    sliceCanvas.height = contentBottomPx;
    const sctx = sliceCanvas.getContext("2d");
    if (sctx) {
      sctx.fillStyle = "#ffffff";
      sctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
      sctx.drawImage(canvas, 0, 0);
    }
    pdf.addImage(
      (sctx ? sliceCanvas : canvas).toDataURL("image/jpeg", 0.92),
      "JPEG",
      0,
      0,
      imgW,
      Math.min(effectiveImgH, pageH),
    );
    return;
  }

  // Multi-page: collect row-bottom Y coordinates in CANVAS pixel space.
  const breaks: number[] = [];
  printEl
    .querySelectorAll<HTMLElement>('[data-pdf-row="true"]')
    .forEach((el) => {
      const r = el.getBoundingClientRect();
      const yBottom = (r.bottom - printRect.top) * scaleY;
      if (yBottom > 0 && yBottom < contentBottomPx) breaks.push(yBottom);
    });
  breaks.sort((a, b) => a - b);
  // Sentinel: stop at the actual content bottom (not the full canvas).
  if (breaks[breaks.length - 1] !== contentBottomPx) breaks.push(contentBottomPx);

  // One A4 page in canvas pixels.
  const pageHpx = (pageH * canvas.width) / imgW;

  let cursor = 0;
  let firstPage = true;
  while (cursor < contentBottomPx - 1) {
    const limit = cursor + pageHpx;
    // Largest break that is > cursor and ≤ limit.
    let cut = -1;
    for (const b of breaks) {
      if (b <= cursor) continue;
      if (b <= limit) cut = b;
      else break;
    }
    // No row break fits inside this page (e.g. a single very tall block):
    // fall back to a hard cut at the page limit.
    if (cut < 0) cut = Math.min(limit, contentBottomPx);

    const sliceH = Math.ceil(cut - cursor);
    const slice = document.createElement("canvas");
    slice.width = canvas.width;
    slice.height = sliceH;
    const ctx = slice.getContext("2d");
    if (!ctx) {
      // Should never happen. Fail closed by stamping a single full image.
      pdf.addImage(
        canvas.toDataURL("image/jpeg", 0.92),
        "JPEG",
        0,
        0,
        imgW,
        fullImgH,
      );
      return;
    }
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, slice.width, slice.height);
    ctx.drawImage(canvas, 0, -cursor);

    const sliceImgH = (sliceH * imgW) / canvas.width;
    if (!firstPage) pdf.addPage();
    firstPage = false;
    pdf.addImage(
      slice.toDataURL("image/jpeg", 0.92),
      "JPEG",
      0,
      0,
      imgW,
      sliceImgH,
    );
    cursor = cut;
  }
}
