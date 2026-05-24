/**
 * WCAG 2.1 contrast ratio utilities.
 *
 * Implements the relative luminance and contrast ratio algorithms from
 * https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 * and the contrast ratio definition from
 * https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio
 */

/** Parse a CSS hex colour (#rgb or #rrggbb) to a [0–255, 0–255, 0–255] tuple. */
export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace(/^#/, "");

  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    return [r, g, b];
  }

  if (clean.length === 6) {
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    return [r, g, b];
  }

  throw new Error(`Invalid hex colour: ${hex}`);
}

/** Compute WCAG 2.1 relative luminance from an sRGB triple (0–255 each). */
export function relativeLuminance(rgb: [number, number, number]): number {
  const [R, G, B] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

/** Compute the WCAG 2.1 contrast ratio between two luminance values. */
export function contrastRatio(L1: number, L2: number): number {
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Return true if the contrast ratio meets WCAG 2 AA.
 * Normal text: >= 4.5:1. Large text (>= 18pt / 14pt bold): >= 3:1.
 */
export function meetsAA(ratio: number, isLargeText = false): boolean {
  return ratio >= (isLargeText ? 3.0 : 4.5);
}

/**
 * Return true if the contrast ratio meets WCAG 2 AAA.
 * Normal text: >= 7:1. Large text: >= 4.5:1.
 */
export function meetsAAA(ratio: number, isLargeText = false): boolean {
  return ratio >= (isLargeText ? 4.5 : 7.0);
}
