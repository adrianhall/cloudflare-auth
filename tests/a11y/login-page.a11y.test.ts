/**
 * axe-core structural accessibility scan for renderLoginPage().
 *
 * Runs WCAG 2.x rules against the rendered HTML in a jsdom environment
 * (provided by the "a11y" Vitest project configuration).
 *
 * Note: axe-core in jsdom accurately evaluates structural rules (labels,
 * ARIA, heading hierarchy, form attributes, landmark regions, document
 * language) but cannot evaluate color contrast — that is covered by
 * contrast.test.ts.
 */

import axe from "axe-core";
import { describe, expect, it } from "vitest";
import { renderLoginPage } from "../../src/login-page.js";

/** Load a full HTML document into the Vitest jsdom environment. */
function loadHtml(html: string): void {
  document.open();
  document.write(html);
  document.close();
}

function formatViolations(violations: axe.Result[]): string {
  return violations
    .map((v) => `[${v.id}] impact=${v.impact} — ${v.nodes[0]?.html ?? "(no node)"}`)
    .join("\n");
}

describe("login-page axe-core accessibility scan", () => {
  it("default page has zero WCAG violations", async () => {
    loadHtml(renderLoginPage("/_auth/callback", "/dashboard"));

    const results = await axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] }
    });

    expect(results.violations, `Violations:\n${formatViolations(results.violations)}`).toHaveLength(
      0
    );
  });

  it("error state has zero WCAG violations", async () => {
    loadHtml(renderLoginPage("/_auth/callback", "/dashboard", "Enter a valid email address"));

    const results = await axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] }
    });

    expect(results.violations, `Violations:\n${formatViolations(results.violations)}`).toHaveLength(
      0
    );
  });
});
