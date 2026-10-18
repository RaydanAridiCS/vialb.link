"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, CheckCircle2, Loader2, Mail, MailCheck } from "lucide-react";
import { GithubIcon } from "@/components/icons";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { forgotSchema, resetSchema, signInSchema, signUpSchema } from "../schemas";

type Provider = "github" | "google";

function FormError({ message }: { message: string | null }) {
  return message ? (
    <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {message}
    </p>
  ) : null;
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path
        fill="currentColor"
        d="M21.35 11.1H12v2.98h5.35c-.23 1.4-1.66 4.1-5.35 4.1-3.22 0-5.85-2.67-5.85-5.95S8.78 6.28 12 6.28c1.83 0 3.06.78 3.76 1.45l2.57-2.47C16.68 3.72 14.55 2.8 12 2.8 6.98 2.8 2.9 6.88 2.9 11.9S6.98 21 12 21c5.25 0 8.73-3.69 8.73-8.89 0-.6-.07-1.05-.15-1.51z"
      />
    </svg>
  );
}

export function SocialButtons({ providers }: { providers: Provider[] }) {
  const [pending, setPending] = useState<Provider | null>(null);
  if (providers.length === 0) return null;
  return (
    <div className="space-y-3">
      <div className="grid gap-2">
        {providers.map((provider) => (
          <Button
            key={provider}
            type="button"
            variant="outline"
            disabled={pending !== null}
            onClick={async () => {
              setPending(provider);
              await authClient.signIn.social({ provider, callbackURL: "/dashboard" });
              setPending(null);
            }}
          >
            {pending === provider ? (
              <Loader2 className="size-4 animate-spin" />
            ) : provider === "github" ? (
              <GithubIcon className="size-4" />
            ) : (
              <GoogleIcon />
            )}
            Continue with {provider === "github" ? "GitHub" : "Google"}
          </Button>
        ))}
      </div>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <Separator className="flex-1" /> or <Separator className="flex-1" />
      </div>
    </div>
  );
}

export function SignInForm({ showForgot }: { showForgot: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [resendingVerification, setResendingVerification] = useState(false);
  const [verificationResent, setVerificationResent] = useState(false);

  const form = useForm<z.input<typeof signInSchema>>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: z.input<typeof signInSchema>) {
    setError(null);
    setUnverifiedEmail(null);
    setVerificationResent(false);

    const { data, error: authError } = await authClient.signIn.email({
      ...values,
      callbackURL: "/dashboard",
    });

    if (authError) {
      if (authError.code === "EMAIL_NOT_VERIFIED") setUnverifiedEmail(values.email);
      setError(authError.message ?? "Invalid email or password");
      return;
    }
    if (data && "twoFactorRedirect" in data && data.twoFactorRedirect) return; // plugin redirects
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <FormError message={error} />

        {unverifiedEmail ? (
          <div className="animate-in space-y-2.5 rounded-xl border border-primary/20 bg-primary/5 p-3.5 text-xs fade-in-50">
            <div className="flex items-center gap-2 font-medium text-primary">
              <AlertCircle className="size-4 shrink-0" />
              <span>Email verification required</span>
            </div>
            <p className="leading-relaxed text-muted-foreground">
              Your email hasn&apos;t been verified yet. Check your inbox or click below to receive a new
              activation link.
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 w-full text-xs font-medium"
              disabled={resendingVerification || verificationResent}
              onClick={async () => {
                setResendingVerification(true);
                try {
                  const { error: resendError } = await authClient.sendVerificationEmail({
                    email: unverifiedEmail,
                    callbackURL: "/verify-email",
                  });
                  if (resendError) {
                    toast.error(resendError.message ?? "Failed to resend verification link");
                  } else {
                    setVerificationResent(true);
                    toast.success("Verification link sent! Check your inbox.");
                  }
                } catch {
                  toast.error("Failed to send verification link.");
                } finally {
                  setResendingVerification(false);
                }
              }}
            >
              {resendingVerification ? (
                <>
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                  Sending...
                </>
              ) : verificationResent ? (
                <>
                  <CheckCircle2 className="mr-1.5 size-3.5 text-emerald-500" />
                  Link sent! Check your inbox
                </>
              ) : (
                <>
                  <Mail className="mr-1.5 size-3.5" />
                  Resend verification email
                </>
              )}
            </Button>
          </div>
        ) : null}

        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input type="email" autoComplete="email" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <div className="flex items-center justify-between">
                <FormLabel>Password</FormLabel>
                {showForgot ? (
                  <Link
                    href="/forgot-password"
                    className="text-xs text-muted-foreground underline-offset-4 hover:underline"
                  >
                    Forgot password?
                  </Link>
                ) : null}
              </div>
              <FormControl>
                <Input type="password" autoComplete="current-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" size="lg" className="w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
          Sign in
        </Button>
      </form>
    </Form>
  );
}

export function SignUpForm({
  requireVerification,
  onVerificationRequired,
}: {
  requireVerification: boolean;
  onVerificationRequired: (email: string) => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<z.input<typeof signUpSchema>>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { name: "", email: "", password: "", confirm: "" },
  });

  async function onSubmit(values: z.input<typeof signUpSchema>) {
    setError(null);
    const { error: authError } = await authClient.signUp.email({
      name: values.name,
      email: values.email,
      password: values.password,
      // Where the emailed verification link lands (only used when verification is required).
      callbackURL: "/verify-email",
    });
    if (authError) {
      setError(authError.message ?? "Could not create your account");
      return;
    }
    if (requireVerification) {
      onVerificationRequired(values.email);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <FormError message={error} />
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input autoComplete="name" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input type="email" autoComplete="email" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="new-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="confirm"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Confirm password</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="new-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" size="lg" className="w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
          Create account
        </Button>
      </form>
    </Form>
  );
}

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const form = useForm<z.input<typeof forgotSchema>>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email: "" },
  });

  async function onSubmit(values: z.input<typeof forgotSchema>) {
    // Always report success so the form can't be used to discover accounts.
    await authClient.requestPasswordReset({ email: values.email, redirectTo: "/reset-password" });
    setSent(true);
  }

  if (sent) {
    return (
      <div className="animate-in space-y-4 text-center duration-300 fade-in-50" role="status">
        <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/25">
          <MailCheck className="size-6" />
        </div>
        <div className="space-y-1">
          <h3 className="font-display text-lg font-semibold text-foreground">Check your email</h3>
          <p className="text-xs leading-relaxed text-muted-foreground">
            If an account exists for that address, we&apos;ve sent a password reset link. Please check your
            inbox and spam folder.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" className="text-xs" onClick={() => setSent(false)}>
          Send to a different email
        </Button>
      </div>
    );
  }
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input type="email" autoComplete="email" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" size="lg" className="w-full" disabled={form.formState.isSubmitting}>
          Send reset link
        </Button>
      </form>
    </Form>
  );
}

export function ResetPasswordForm({ token }: { token: string | null }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(
    token ? null : "This reset link is invalid or has expired.",
  );
  const form = useForm<z.input<typeof resetSchema>>({
    resolver: zodResolver(resetSchema),
    defaultValues: { password: "", confirm: "" },
  });

  async function onSubmit(values: z.input<typeof resetSchema>) {
    if (!token) return;
    const { error: authError } = await authClient.resetPassword({ newPassword: values.password, token });
    if (authError) {
      setError(authError.message ?? "This reset link is invalid or has expired.");
      return;
    }
    router.push("/sign-in?reset=1");
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <FormError message={error} />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>New password</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="new-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="confirm"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Confirm password</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="new-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" size="lg" className="w-full" disabled={!token || form.formState.isSubmitting}>
          Set new password
        </Button>
      </form>
    </Form>
  );
}

export function TwoFactorForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"totp" | "backup">("totp");
  const [code, setCode] = useState("");
  const [trustDevice, setTrustDevice] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const { error: authError } =
      mode === "totp"
        ? await authClient.twoFactor.verifyTotp({ code, trustDevice })
        : await authClient.twoFactor.verifyBackupCode({ code: code.trim(), trustDevice });
    setPending(false);
    if (authError) {
      setError(authError.message ?? "Invalid code");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <FormError message={error} />
      {mode === "totp" ? (
        <div className="flex flex-col items-center gap-2">
          <Label htmlFor="totp">Authentication code</Label>
          <InputOTP id="totp" maxLength={6} value={code} onChange={setCode} autoFocus inputMode="numeric">
            <InputOTPGroup>
              {Array.from({ length: 6 }, (_, i) => (
                <InputOTPSlot key={i} index={i} />
              ))}
            </InputOTPGroup>
          </InputOTP>
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="backup">Backup code</Label>
          <Input
            id="backup"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoComplete="one-time-code"
          />
        </div>
      )}
      <div className="flex items-center gap-2">
        <Checkbox id="trust" checked={trustDevice} onCheckedChange={(v) => setTrustDevice(v === true)} />
        <Label htmlFor="trust" className="text-sm font-normal">
          Trust this device for 30 days
        </Label>
      </div>
      <Button type="submit" size="lg" className="w-full" disabled={pending || code.length < 6}>
        Verify
      </Button>
      <Button
        type="button"
        variant="link"
        className="w-full"
        onClick={() => {
          setMode(mode === "totp" ? "backup" : "totp");
          setCode("");
        }}
      >
        {mode === "totp" ? "Use a backup code instead" : "Use your authenticator app"}
      </Button>
    </form>
  );
}
