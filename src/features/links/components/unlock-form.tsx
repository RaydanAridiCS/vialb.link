"use client";

import { Loader2, LockOpen } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { unlockLinkAction } from "../unlock-action";

export function UnlockForm({ code, query }: { code: string; query: string }) {
  const [password, setPassword] = useState("");
  const { execute, result, isPending } = useAction(unlockLinkAction);
  const error = result.serverError ?? result.validationErrors?.password?._errors?.[0];

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        execute({ code, password, query });
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="link-password">Password</Label>
        <Input
          id="link-password"
          type="password"
          autoComplete="off"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={!!error}
          aria-describedby={error ? "unlock-error" : undefined}
          required
        />
        <p id="unlock-error" role="alert" className="min-h-5 text-sm text-destructive">
          {error}
        </p>
      </div>
      <Button type="submit" className="w-full" disabled={isPending || password.length === 0}>
        {isPending ? <Loader2 className="size-4 animate-spin" /> : <LockOpen className="size-4" />}
        Continue
      </Button>
    </form>
  );
}
