/**
 * WCAG 2.1 AA color contrast assertions for every foreground/background pair
 * present in the renderLoginPage() inline CSS.
 *
 * Color values are taken directly from src/login-page.ts.
 * axe-core in jsdom cannot evaluate contrast (computed styles unavailable),
 * so this file covers that gap using pure WCAG 2.1 math.
 */

import { describe, expect, it } from "vitest";
import { contrastRatio, hexToRgb, meetsAA, relativeLuminance } from "./helpers/wcag-contrast.js";

function ratio(fg: string, bg: string): number {
  return contrastRatio(relativeLuminance(hexToRgb(fg)), relativeLuminance(hexToRgb(bg)));
}

describe("WCAG 2.1 AA contrast: login page color pairs", () => {
  it("body text #18181b on background #f4f4f5 meets AA (normal text)", () => {
    const r = ratio("#18181b", "#f4f4f5");
    expect(meetsAA(r), `contrast ratio ${r.toFixed(2)}:1 must be >= 4.5:1`).toBe(true);
  });

  it("button (default) #ffffff on #1d4ed8 meets AA (normal text)", () => {
    const r = ratio("#ffffff", "#1d4ed8");
    expect(meetsAA(r), `contrast ratio ${r.toFixed(2)}:1 must be >= 4.5:1`).toBe(true);
  });

  it("button (hover) #ffffff on #1e40af meets AA (normal text)", () => {
    const r = ratio("#ffffff", "#1e40af");
    expect(meetsAA(r), `contrast ratio ${r.toFixed(2)}:1 must be >= 4.5:1`).toBe(true);
  });

  it("error text #991b1b on #fef2f2 meets AA (normal text)", () => {
    const r = ratio("#991b1b", "#fef2f2");
    expect(meetsAA(r), `contrast ratio ${r.toFixed(2)}:1 must be >= 4.5:1`).toBe(true);
  });

  it("subtitle text #71717a on #ffffff meets AA (normal text)", () => {
    const r = ratio("#71717a", "#ffffff");
    expect(meetsAA(r), `contrast ratio ${r.toFixed(2)}:1 must be >= 4.5:1`).toBe(true);
  });

  it("badge text #92400e on #fef3c7 meets AA (normal text)", () => {
    const r = ratio("#92400e", "#fef3c7");
    expect(meetsAA(r), `contrast ratio ${r.toFixed(2)}:1 must be >= 4.5:1`).toBe(true);
  });

  it("regression: old button colour #3b82f6 would have failed AA (documents issue #1)", () => {
    const r = contrastRatio(
      relativeLuminance(hexToRgb("#ffffff")),
      relativeLuminance(hexToRgb("#3b82f6"))
    );
    // Confirms the old value was wrong and the helper detects it.
    expect(r).toBeLessThan(4.5);
  });
});
