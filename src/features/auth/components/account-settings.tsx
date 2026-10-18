"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Download, Loader2, ShieldCheck, ShieldOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { CopyButton } from "@/components/copy-button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { QrPreview } from "@/features/links/components/qr-preview";
import { authClient } from "@/lib/auth-client";
import { changePasswordSchema } from "../schemas";

export function ProfileCard({ name, email }: { name: string; email: string }) {
  const router = useRouter();
  const [value, setValue] = useState(name);
  const [pending, setPending] = useState(false);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-2xl font-normal">Profile</CardTitle>
        <CardDescription>Signed in as {email}</CardDescription>
      </CardHeader>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setPending(true);
          const { error } = await authClient.updateUser({ name: value.trim() });
          setPending(false);
          if (error) toast.error(error.message ?? "Could not update profile");
          else {
            toast.success("Profile updated");
            router.refresh();
          }
        }}
      >
        <CardContent className="space-y-2">
          <Label htmlFor="profile-name">Display name</Label>
          <Input id="profile-name" value={value} maxLength={80} onChange={(e) => setValue(e.target.value)} />
        </CardContent>
        <CardFooter className="mt-4">
          <Button type="submit" disabled={pending || value.trim() === "" || value === name}>
            Save
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

export function ChangePasswordCard() {
  const form = useForm<z.input<typeof changePasswordSchema>>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirm: "" },
  });
  async function onSubmit(values: z.input<typeof changePasswordSchema>) {
    const { error } = await authClient.changePassword({
      currentPassword: values.currentPassword,
      newPassword: values.newPassword,
      revokeOtherSessions: true,
    });
    if (error) {
      form.setError("currentPassword", { message: error.message ?? "Could not change password" });
      return;
    }
    toast.success("Password changed. Other sessions were signed out.");
    form.reset();
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-2xl font-normal">Password</CardTitle>
        <CardDescription>Changing it signs out your other sessions.</CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            {(
              [
                ["currentPassword", "Current password", "current-password"],
                ["newPassword", "New password", "new-password"],
                ["confirm", "Confirm new password", "new-password"],
              ] as const
            ).map(([name, label, autoComplete]) => (
              <FormField
                key={name}
                control={form.control}
                name={name}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{label}</FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete={autoComplete} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ))}
          </CardContent>
          <CardFooter className="mt-4">
            <Button type="submit" disabled={form.formState.isSubmitting}>
              Change password
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}

export function TwoFactorCard({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [setup, setSetup] = useState<{ totpURI: string; backupCodes: string[] } | null>(null);
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);

  async function start() {
    setPending(true);
    const { data, error } = await authClient.twoFactor.enable({ password });
    setPending(false);
    if (error || !data || !("totpURI" in data)) {
      toast.error(error?.message ?? "Could not start setup");
      return;
    }
    setSetup({ totpURI: data.totpURI, backupCodes: data.backupCodes });
    setPassword("");
  }

  async function verify() {
    setPending(true);
    const { error } = await authClient.twoFactor.verifyTotp({ code });
    setPending(false);
    if (error) {
      toast.error(error.message ?? "Invalid code");
      return;
    }
    toast.success("Two-factor authentication enabled");
    setBackupCodes(setup?.backupCodes ?? null);
    setSetup(null);
    router.refresh();
  }

  async function disable() {
    setPending(true);
    const { error } = await authClient.twoFactor.disable({ password });
    setPending(false);
    if (error) {
      toast.error(error.message ?? "Could not disable 2FA");
      return;
    }
    toast.success("Two-factor authentication disabled");
    setPassword("");
    router.refresh();
  }

  async function regenerate() {
    setPending(true);
    const { data, error } = await authClient.twoFactor.generateBackupCodes({ password });
    setPending(false);
    if (error || !data) {
      toast.error(error?.message ?? "Could not generate codes");
      return;
    }
    setBackupCodes(data.backupCodes);
    setPassword("");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-display text-2xl font-normal">
          Two-factor authentication
          {enabled ? (
            <Badge>
              <ShieldCheck className="size-3" /> On
            </Badge>
          ) : (
            <Badge variant="outline">
              <ShieldOff className="size-3" /> Off
            </Badge>
          )}
        </CardTitle>
        <CardDescription>Require a code from an authenticator app (TOTP) when signing in.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {backupCodes ? (
          <div className="space-y-2 rounded-lg border p-4">
            <p className="text-sm font-medium">
              Backup codes. Store them somewhere safe. Each one works once.
            </p>
            <ul className="grid grid-cols-2 gap-1 font-mono text-sm sm:grid-cols-5">
              {backupCodes.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            <CopyButton value={backupCodes.join("\n")} label="Copy codes" />
          </div>
        ) : null}

        {setup ? (
          <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
            <QrPreview value={setup.totpURI} size={176} />
            <div className="space-y-3">
              <p className="text-sm">
                Scan the QR code with your authenticator app, then enter the 6-digit code.
              </p>
              <InputOTP maxLength={6} value={code} onChange={setCode} aria-label="Authenticator code">
                <InputOTPGroup>
                  {Array.from({ length: 6 }, (_, i) => (
                    <InputOTPSlot key={i} index={i} />
                  ))}
                </InputOTPGroup>
              </InputOTP>
              <Button onClick={verify} disabled={pending || code.length < 6}>
                Verify and enable
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="tfa-password">Confirm with your password</Label>
              <Input
                id="tfa-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {enabled ? (
              <>
                <Button variant="outline" onClick={regenerate} disabled={pending || !password}>
                  New backup codes
                </Button>
                <Button variant="destructive" onClick={disable} disabled={pending || !password}>
                  Disable 2FA
                </Button>
              </>
            ) : (
              <Button onClick={start} disabled={pending || !password}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                Set up 2FA
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function DataCard() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);

  async function deleteAccount() {
    setPending(true);
    const { error } = await authClient.deleteUser({ password: password || undefined, callbackURL: "/" });
    setPending(false);
    if (error) {
      toast.error(error.message ?? "Could not delete account");
      return;
    }
    toast.success("Your account and all of your links were deleted");
    router.push("/");
    router.refresh();
  }

  return (
    <Card className="border-destructive/30 bg-destructive/[0.03]">
      <CardHeader>
        <CardTitle className="font-display text-2xl font-normal">Your data</CardTitle>
        <CardDescription>Export everything or permanently delete your account.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button variant="outline" asChild>
          <a href="/api/app/me/export" download>
            <Download className="size-4" /> Export my data (JSON)
          </a>
        </Button>
        <Button variant="destructive" onClick={() => setOpen(true)}>
          Delete account
        </Button>
      </CardContent>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your account?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes your account, all of your links and their analytics. This cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="delete-password">Password</Label>
            <Input
              id="delete-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button variant="destructive" onClick={deleteAccount} disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              Delete forever
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
