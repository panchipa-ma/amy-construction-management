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

  // Single-page fast path (1mm tolerance for rounding).
  if (fullImgH <= pageH + 1) {
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

  // Multi-page: collect row-bottom Y coordinates in CANVAS pixel space.
  const printRect = printEl.getBoundingClientRect();
  const scaleY = canvas.height / printRect.height;
  const breaks: number[] = [];
  printEl
    .querySelectorAll<HTMLElement>('[data-pdf-row="true"]')
    .forEach((el) => {
      const r = el.getBoundingClientRect();
      const yBottom = (r.bottom - printRect.top) * scaleY;
      if (yBottom > 0 && yBottom < canvas.height) breaks.push(yBottom);
    });
  breaks.sort((a, b) => a - b);
  // Sentinel: the very bottom of the canvas is always a valid break.
  if (breaks[breaks.length - 1] !== canvas.height) breaks.push(canvas.height);

  // One A4 page in canvas pixels.
  const pageHpx = (pageH * canvas.width) / imgW;

  let cursor = 0;
  let firstPage = true;
  while (cursor < canvas.height - 1) {
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
    if (cut < 0) cut = Math.min(limit, canvas.height);

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
