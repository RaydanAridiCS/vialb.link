import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EmailVerificationCard } from "@/features/auth/components/email-verification-card";
import { VerifyEmailView } from "@/features/auth/components/verify-email-view";

const sendVerificationEmail = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/lib/auth-client", () => ({
  authClient: { sendVerificationEmail: (a: unknown) => sendVerificationEmail(a) },
}));
vi.mock("sonner", () => ({ toast }));

beforeEach(() => {
  sendVerificationEmail.mockReset();
  toast.success.mockReset();
  toast.error.mockReset();
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => vi.useRealTimers());

describe("EmailVerificationCard: resend", () => {
  it("sends the link to the address shown, then locks the button for a minute with a countdown", async () => {
    sendVerificationEmail.mockResolvedValue({ error: null });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<EmailVerificationCard email="ada@example.com" />);
    expect(screen.getByText("ada@example.com")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /resend verification email/i }));
    expect(sendVerificationEmail).toHaveBeenCalledWith({
      email: "ada@example.com",
      callbackURL: "/verify-email",
    });
    expect(toast.success).toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: /resend email in 60s/i })).toBeDisabled();

    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(screen.getByRole("button", { name: /resend email in 30s/i })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /resend email in/i })).catch(() => undefined);
    expect(sendVerificationEmail).toHaveBeenCalledTimes(1);

    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(await screen.findByRole("button", { name: /resend verification email/i })).toBeEnabled();
  });

  it("shows the server's reason and stays usable when sending fails", async () => {
    sendVerificationEmail.mockResolvedValue({ error: { message: "Too many requests" } });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<EmailVerificationCard email="ada@example.com" callbackURL="/welcome" />);
    await user.click(screen.getByRole("button", { name: /resend verification email/i }));
    expect(toast.error).toHaveBeenCalledWith("Too many requests");
    expect(sendVerificationEmail).toHaveBeenCalledWith({ email: "ada@example.com", callbackURL: "/welcome" });
    expect(await screen.findByRole("button", { name: /resend verification email/i })).toBeEnabled();
  });

  it("copes with a network failure", async () => {
    sendVerificationEmail.mockRejectedValue(new Error("offline"));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<EmailVerificationCard email="ada@example.com" />);
    await user.click(screen.getByRole("button", { name: /resend verification email/i }));
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/connection/));
    expect(await screen.findByRole("button", { name: /resend verification email/i })).toBeEnabled();
  });
});

describe("VerifyEmailView", () => {
  it("offers a fresh link by address when the old one expired", async () => {
    sendVerificationEmail.mockResolvedValue({ error: null });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<VerifyEmailView initialError="TOKEN_EXPIRED" />);
    const field = screen.getByLabelText(/email/i);
    await user.type(field, "ada@example.com");
    await user.click(screen.getByRole("button", { name: /send/i }));
    expect(sendVerificationEmail).toHaveBeenCalledWith({
      email: "ada@example.com",
      callbackURL: "/verify-email",
    });
    expect(await screen.findByText("Check your inbox")).toBeInTheDocument();
  });

  it("shows the success card for a verified account without sending anything", () => {
    render(<VerifyEmailView initialVerified />);
    expect(screen.getByText("Email verified!")).toBeInTheDocument();
    expect(sendVerificationEmail).not.toHaveBeenCalled();
  });
});
