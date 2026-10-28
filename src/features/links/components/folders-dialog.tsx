"use client";

import { Check, FolderCog, Pencil, Plus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { LIMITS } from "@/lib/constants";
import { createFolderAction, deleteFolderAction, renameFolderAction } from "../actions";

export interface FolderOption {
  id: string;
  name: string;
  linkCount: number;
}

/** Create, rename and delete the workspace's folders. Deleting keeps the links; they just leave the folder. */
export function FoldersDialog({ folders }: { folders: FolderOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const onError = ({ error }: { error: { serverError?: string } }) =>
    toast.error(error.serverError ?? "Something went wrong");
  const create = useAction(createFolderAction, {
    onSuccess: () => {
      setName("");
      router.refresh();
    },
    onError,
  });
  const rename = useAction(renameFolderAction, {
    onSuccess: () => {
      setEditing(null);
      router.refresh();
    },
    onError,
  });
  const remove = useAction(deleteFolderAction, {
    onSuccess: () => {
      setConfirming(null);
      toast.success("Folder deleted; its links were kept");
      router.refresh();
    },
    onError,
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" data-testid="manage-folders">
          <FolderCog className="size-4" /> Folders
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Folders</DialogTitle>
          <DialogDescription>
            A link can be in one folder. Deleting a folder never deletes its links.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) create.execute({ name });
          }}
        >
          <Input
            aria-label="New folder name"
            placeholder="New folder"
            value={name}
            maxLength={LIMITS.folderNameMax * 3}
            onChange={(e) => setName(e.target.value)}
          />
          <Button type="submit" disabled={create.isPending || !name.trim()}>
            <Plus className="size-4" /> Add
          </Button>
        </form>
        {folders.length === 0 ? (
          <p className="text-sm text-muted-foreground">No folders yet.</p>
        ) : (
          <ul className="max-h-72 divide-y overflow-y-auto rounded-lg border" data-testid="folder-list">
            {folders.map((folder) => (
              <li
                key={folder.id}
                className="flex items-center gap-2 px-3 py-2 text-sm"
                data-testid="folder-item"
              >
                {editing?.id === folder.id ? (
                  <form
                    className="flex flex-1 items-center gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      rename.execute({ id: folder.id, name: editing.name });
                    }}
                  >
                    <Input
                      aria-label={`Rename ${folder.name}`}
                      autoFocus
                      value={editing.name}
                      maxLength={LIMITS.folderNameMax * 3}
                      onChange={(e) => setEditing({ id: folder.id, name: e.target.value })}
                    />
                    <Button
                      type="submit"
                      size="icon"
                      variant="ghost"
                      aria-label="Save name"
                      disabled={rename.isPending}
                    >
                      <Check className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label="Cancel"
                      onClick={() => setEditing(null)}
                    >
                      <X className="size-4" />
                    </Button>
                  </form>
                ) : (
                  <>
                    <span className="min-w-0 flex-1 truncate">{folder.name}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {folder.linkCount} {folder.linkCount === 1 ? "link" : "links"}
                    </span>
                    {confirming === folder.id ? (
                      <>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={remove.isPending}
                          onClick={() => remove.execute({ id: folder.id })}
                        >
                          Delete folder
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                          Keep
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Rename ${folder.name}`}
                          onClick={() => setEditing({ id: folder.id, name: folder.name })}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Delete ${folder.name}`}
                          onClick={() => setConfirming(folder.id)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
