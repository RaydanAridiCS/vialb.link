import { describe, expect, it } from "vitest";
import { renderPasswordResetEmail, renderVerificationEmail } from "@/server/auth/email-templates";

describe("email-templates", () => {
  describe("renderVerificationEmail", () => {
    it("renders both plain-text and HTML containing the verification URL and app name", () => {
      const result = renderVerificationEmail({
        appName: "ToolWright",
        siteUrl: "https://toolwright.com",
        verificationUrl: "https://toolwright.com/api/auth/verify-email?token=xyz",
        userEmail: "user@example.com",
        userName: "Alex Doe",
      });

      expect(result.text).toContain("ToolWright");
      expect(result.text).toContain("https://toolwright.com/api/auth/verify-email?token=xyz");
      expect(result.text).toContain("user@example.com");
      expect(result.text).toContain("Alex Doe");

      expect(result.html).toContain("ToolWright");
      expect(result.html).toContain("https://toolwright.com/api/auth/verify-email?token=xyz");
      expect(result.html).toContain("user@example.com");
      expect(result.html).toContain("Alex Doe");
      expect(result.html).toContain("Verify email address");
    });

    it("escapes user input to prevent HTML injection in emails", () => {
      const result = renderVerificationEmail({
        appName: "ToolWright",
        siteUrl: "https://toolwright.com",
        verificationUrl: "https://toolwright.com/api/auth/verify-email?token=xyz",
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
        appName: "ToolWright",
        siteUrl: "https://toolwright.com",
        resetUrl: "https://toolwright.com/reset-password?token=secret123",
        userEmail: "reset@example.com",
      });

      expect(result.text).toContain("https://toolwright.com/reset-password?token=secret123");
      expect(result.html).toContain("https://toolwright.com/reset-password?token=secret123");
      expect(result.html).toContain("Reset password");
    });
  });

  it("keeps the plain-text part unescaped and states the real 1 hour expiry", () => {
    const input = {
      appName: "ToolWright",
      siteUrl: "https://toolwright.com",
      userEmail: "tj@example.com",
      userName: "Tom & Jerry",
    };
    const verify = renderVerificationEmail({ ...input, verificationUrl: "https://toolwright.com/v" });
    const reset = renderPasswordResetEmail({ ...input, resetUrl: "https://toolwright.com/r" });

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
