"use client";

import { KeyRound, Loader2, Plus, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { toast } from "sonner";
import { CopyButton } from "@/components/copy-button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime, formatRelative } from "@/lib/format";
import type { ApiKeyDto } from "@/server/services/dto";
import { createApiKeyAction, revokeApiKeyAction } from "../actions";

export function ApiKeysManager({ keys, siteUrl }: { keys: ApiKeyDto[]; siteUrl: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<ApiKeyDto | null>(null);

  const create = useAction(createApiKeyAction, {
    onSuccess: ({ data }) => {
      if (!data) return;
      setSecret(data.secret);
      setName("");
      router.refresh();
    },
    onError: ({ error }) =>
      toast.error(error.serverError ?? error.validationErrors?.name?._errors?.[0] ?? "Could not create key"),
  });
  const revoke = useAction(revokeApiKeyAction, {
    onSuccess: () => {
      toast.success("API key revoked");
      router.refresh();
    },
    onError: ({ error }) => toast.error(error.serverError ?? "Could not revoke key"),
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Create an API key</CardTitle>
          <CardDescription>
            Keys act on your behalf. The secret is shown only once — store it safely.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            className="flex flex-col gap-2 sm:flex-row sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              create.execute({ name });
            }}
          >
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="key-name">Name</Label>
              <Input
                id="key-name"
                placeholder="e.g. CI pipeline"
                value={name}
                maxLength={64}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={create.isPending || name.trim() === ""}>
              {create.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Create key
            </Button>
          </form>
          {secret ? (
            <div
              className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4"
              role="status"
            >
              <p className="flex items-center gap-2 text-sm font-medium">
                <TriangleAlert className="size-4" aria-hidden /> Copy your key now — you won&apos;t see it
                again.
              </p>
              <div className="flex items-center gap-2">
                <code
                  className="flex-1 truncate rounded-md border bg-background px-3 py-2 font-mono text-sm"
                  data-testid="api-key-secret"
                >
                  {secret}
                </code>
                <CopyButton value={secret} />
              </div>
              <pre className="overflow-x-auto rounded-md border bg-background p-3 text-xs">
                <code>{`curl -X POST ${siteUrl}/api/v1/links \\
  -H "Authorization: Bearer ${secret}" \\
  -H "Content-Type: application/json" \\
  -d '{"url":"https://example.com"}'`}</code>
              </pre>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your keys</CardTitle>
        </CardHeader>
        <CardContent>
          {keys.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-sm text-muted-foreground">
              <KeyRound className="size-6" aria-hidden />
              No API keys yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Key</TableHead>
                    <TableHead>Last used</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {keys.map((key) => (
                    <TableRow key={key.id}>
                      <TableCell className="font-medium">
                        {key.name} {key.revokedAt ? <Badge variant="outline">revoked</Badge> : null}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{key.prefix}…</TableCell>
                      <TableCell className="text-muted-foreground">
                        {key.lastUsedAt ? formatRelative(key.lastUsedAt) : "Never"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{formatDateTime(key.createdAt)}</TableCell>
                      <TableCell className="text-right">
                        {key.revokedAt ? null : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            onClick={() => setRevoking(key)}
                          >
                            Revoke
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={revoking !== null} onOpenChange={(open) => !open && setRevoking(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke “{revoking?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Applications using this key will immediately get 401 errors.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => {
                if (revoking) revoke.execute({ id: revoking.id });
                setRevoking(null);
              }}
            >
              Revoke key
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
