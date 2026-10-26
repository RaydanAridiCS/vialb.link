"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LIMITS } from "@/lib/constants";
import { createWorkspaceAction } from "../actions";

export function CreateWorkspaceForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const create = useAction(createWorkspaceAction, {
    onSuccess: () => {
      toast.success("Workspace created");
      setName("");
      router.refresh();
    },
    onError: ({ error: failure }) => {
      setError(
        failure.validationErrors?.name?._errors?.[0] ?? failure.serverError ?? "Could not create workspace",
      );
    },
  });

  return (
    <form
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        create.execute({ name });
      }}
      noValidate
    >
      <div className="flex-1 space-y-1.5">
        <Label htmlFor="new-workspace-name">Team name</Label>
        <Input
          id="new-workspace-name"
          value={name}
          maxLength={LIMITS.workspaceNameMax}
          placeholder="Acme marketing"
          onChange={(event) => setName(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "new-workspace-error" : undefined}
        />
        {error ? (
          <p id="new-workspace-error" role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
      <Button type="submit" disabled={create.isPending}>
        {create.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
        Create team
      </Button>
    </form>
  );
}
