/**
 * Replace every <input>, <textarea>, <select> inside `root` with a static
 * <span> that renders the current value. html2canvas-pro renders form
 * controls poorly (text often gets clipped to a few pixels tall, or appears
 * as a thin sliver/glyph fragment), so for PDF capture we temporarily
 * substitute plain text spans that copy the original control's computed
 * styles — which html2canvas handles reliably.
 *
 * Returns an `unfreeze` function that restores the originals. Always wrap
 * in try/finally so the form remains interactive even if capture throws.
 */
export function freezeInputsForCapture(root: HTMLElement): () => void {
  const swaps: Array<{
    el: HTMLElement;
    placeholder: HTMLSpanElement;
    prevInlineDisplay: string;
  }> = [];

  const controls = root.querySelectorAll<
    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  >("input, textarea, select");

  controls.forEach((el) => {
    let text = "";
    if (el instanceof HTMLSelectElement) {
      const opt = el.options[el.selectedIndex];
      text = opt ? opt.text : "";
    } else {
      text = el.value ?? "";
    }

    const cs = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();

    const span = document.createElement("span");
    span.textContent = text;
    // Box layout — match the original control's footprint exactly so the
    // surrounding grid does not shift while inputs are hidden.
    span.style.display = "inline-block";
    span.style.boxSizing = "border-box";
    span.style.width = `${rect.width}px`;
    span.style.minHeight = `${rect.height}px`;
    span.style.verticalAlign = "middle";
    span.style.padding = "0";
    span.style.margin = "0";
    span.style.border = "none";
    span.style.background = "transparent";
    // Typography — copy from the original.
    span.style.fontFamily = cs.fontFamily;
    span.style.fontSize = cs.fontSize;
    span.style.fontWeight = cs.fontWeight;
    span.style.fontStyle = cs.fontStyle;
    span.style.lineHeight = `${rect.height}px`;
    span.style.color = cs.color;
    span.style.textAlign = cs.textAlign;
    span.style.fontVariantNumeric = cs.fontVariantNumeric;
    span.style.whiteSpace = "pre";
    span.style.overflow = "hidden";

    el.parentNode?.insertBefore(span, el);
    swaps.push({
      el: el as HTMLElement,
      placeholder: span,
      prevInlineDisplay: (el as HTMLElement).style.display,
    });
    (el as HTMLElement).style.display = "none";
  });

  return () => {
    for (const { el, placeholder, prevInlineDisplay } of swaps) {
      placeholder.remove();
      el.style.display = prevInlineDisplay;
    }
  };
}
