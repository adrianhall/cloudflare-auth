/**
 * axe-core structural accessibility scan for renderViteLoginPage().
 *
 * Runs WCAG 2.x rules against the rendered HTML in a jsdom environment
 * (provided by the "a11y" Vitest project configuration), covering the
 * single-email, selectable-users, and error states.
 *
 * Color contrast is evaluated separately by contrast.test.ts; jsdom
 * cannot compute styles.
 */

import axe from "axe-core";
import { describe, expect, it } from "vitest";
import { renderViteLoginPage } from "../../src/vite-login-page.js";

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

async function scan() {
  return axe.run(document, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] }
  });
}

describe("vite-login-page axe-core accessibility scan", () => {
  it("single-email form has zero WCAG violations", async () => {
    loadHtml(renderViteLoginPage("/cdn-cgi/access/login", "/dashboard"));
    const results = await scan();
    expect(results.violations, `Violations:\n${formatViolations(results.violations)}`).toHaveLength(
      0
    );
  });

  it("selectable-users form has zero WCAG violations", async () => {
    loadHtml(
      renderViteLoginPage("/cdn-cgi/access/login", "/", [
        { email: "alice@example.com", name: "Alice" },
        { email: "bob@example.com" }
      ])
    );
    const results = await scan();
    expect(results.violations, `Violations:\n${formatViolations(results.violations)}`).toHaveLength(
      0
    );
  });

  it("error state has zero WCAG violations", async () => {
    loadHtml(renderViteLoginPage("/cdn-cgi/access/login", "/", [], "Enter a valid email address"));
    const results = await scan();
    expect(results.violations, `Violations:\n${formatViolations(results.violations)}`).toHaveLength(
      0
    );
  });
});
