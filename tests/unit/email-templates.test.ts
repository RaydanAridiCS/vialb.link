import { describe, expect, it } from "vitest";
import { renderPasswordResetEmail, renderVerificationEmail } from "@/server/auth/email-templates";

describe("email-templates", () => {
  describe("renderVerificationEmail", () => {
    it("renders both plain-text and HTML containing the verification URL and app name", () => {
      const result = renderVerificationEmail({
        appName: "Vialb",
        siteUrl: "https://vialb.link",
        verificationUrl: "https://vialb.link/api/auth/verify-email?token=xyz",
        userEmail: "user@example.com",
        userName: "Alex Doe",
      });

      expect(result.text).toContain("Vialb");
      expect(result.text).toContain("https://vialb.link/api/auth/verify-email?token=xyz");
      expect(result.text).toContain("user@example.com");
      expect(result.text).toContain("Alex Doe");

      expect(result.html).toContain("Vialb");
      expect(result.html).toContain("https://vialb.link/api/auth/verify-email?token=xyz");
      expect(result.html).toContain("user@example.com");
      expect(result.html).toContain("Alex Doe");
      expect(result.html).toContain("Verify email address");
    });

    it("escapes user input to prevent HTML injection in emails", () => {
      const result = renderVerificationEmail({
        appName: "Vialb",
        siteUrl: "https://vialb.link",
        verificationUrl: "https://vialb.link/api/auth/verify-email?token=xyz",
        userEmail: "<script>alert(1)</script>@example.com",
        userName: "<img src=x onerror=alert(1)>",
      });

      expect(result.html).not.toContain("<script>");
      expect(result.html).toContain("&lt;script&gt;");
      expect(result.html).not.toContain("<img src=x");
      expect(result.html).toContain("&lt;img src=x");
    });
  });

  describe("renderPasswordResetEmail", () => {
    it("renders both plain-text and HTML containing reset URL", () => {
      const result = renderPasswordResetEmail({
        appName: "Vialb",
        siteUrl: "https://vialb.link",
        resetUrl: "https://vialb.link/reset-password?token=secret123",
        userEmail: "reset@example.com",
      });

      expect(result.text).toContain("https://vialb.link/reset-password?token=secret123");
      expect(result.html).toContain("https://vialb.link/reset-password?token=secret123");
      expect(result.html).toContain("Reset password");
    });
  });

  it("keeps the plain-text part unescaped and states the real 1 hour expiry", () => {
    const input = {
      appName: "Vialb",
      siteUrl: "https://vialb.link",
      userEmail: "tj@example.com",
      userName: "Tom & Jerry",
    };
    const verify = renderVerificationEmail({ ...input, verificationUrl: "https://vialb.link/v" });
    const reset = renderPasswordResetEmail({ ...input, resetUrl: "https://vialb.link/r" });

    for (const { text, html } of [verify, reset]) {
      expect(text).toContain("Hi Tom & Jerry,");
      expect(text).not.toContain("&amp;");
      expect(html).toContain("Hi Tom &amp; Jerry,");
      expect(text).not.toContain("—");
    }
    expect(verify.text).toContain("expire in 1 hour");
    expect(verify.html).toContain("<strong>1 hour</strong>");
  });
});
