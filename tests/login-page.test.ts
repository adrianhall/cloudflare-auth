/**
 * Unit tests for renderLoginPage().
 *
 * Tests rendering correctness, argument injection, conditional error display,
 * and XSS escaping. These belong in the unit project: fast, no browser
 * requirement, testing code correctness rather than accessibility compliance.
 */

import { describe, expect, it } from "vitest";
import { renderLoginPage } from "../src/login-page.js";

describe("renderLoginPage()", () => {
  it("returns a string starting with <!DOCTYPE html>", () => {
    const html = renderLoginPage("/_auth/callback", "/dashboard");
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
  });

  it('the <html> element has lang="en"', () => {
    const html = renderLoginPage("/_auth/callback", "/dashboard");
    expect(html).toContain('<html lang="en">');
  });

  it("the form action attribute equals the callbackPath argument", () => {
    const html = renderLoginPage("/_auth/callback", "/dashboard");
    expect(html).toContain('action="/_auth/callback"');
  });

  it("the hidden redirect input value equals the redirectTo argument", () => {
    const html = renderLoginPage("/_auth/callback", "/dashboard");
    expect(html).toContain('name="redirect" value="/dashboard"');
  });

  it('the email input has id="email" and type="email"', () => {
    const html = renderLoginPage("/_auth/callback", "/dashboard");
    expect(html).toContain('id="email"');
    expect(html).toContain('type="email"');
  });

  it('the label has for="email"', () => {
    const html = renderLoginPage("/_auth/callback", "/dashboard");
    expect(html).toContain('for="email"');
  });

  it('with no error argument: no role="alert" element is present', () => {
    const html = renderLoginPage("/_auth/callback", "/dashboard");
    expect(html).not.toContain('role="alert"');
  });

  it('with an error argument: a role="alert" element is present containing the error text', () => {
    const html = renderLoginPage("/_auth/callback", "/dashboard", "Enter a valid email address");
    expect(html).toContain('role="alert"');
    expect(html).toContain("Enter a valid email address");
  });

  it("XSS: <script> in callbackPath is HTML-escaped in the output", () => {
    const html = renderLoginPage("/<script>alert(1)</script>", "/dashboard");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("XSS: <script> in redirectTo is HTML-escaped in the output", () => {
    const html = renderLoginPage("/_auth/callback", "<script>alert(1)</script>");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("XSS: <script> in error is HTML-escaped in the output", () => {
    const html = renderLoginPage("/_auth/callback", "/dashboard", "<script>alert(1)</script>");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
