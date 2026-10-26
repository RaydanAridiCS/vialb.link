"use client";

import { Mail } from "lucide-react";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { PENDING_INVITE_EVENT, PENDING_INVITE_STORAGE_KEY } from "@/lib/constants";

const CHANGED = PENDING_INVITE_EVENT;

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGED, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGED, onChange);
  };
}

function read(): string | null {
  try {
    return localStorage.getItem(PENDING_INVITE_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** After signing in, offers the invitation the person opened before they had an account. */
export function PendingInvite() {
  const token = useSyncExternalStore(subscribe, read, () => null);
  if (!token) return null;
  return (
    <div
      role="status"
      className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm"
      data-testid="pending-invite"
    >
      <span className="flex items-center gap-2">
        <Mail className="size-4 text-primary" aria-hidden /> You have a team invitation waiting.
      </span>
      <span className="flex gap-3">
        <Link href={`/invite/${token}`} className="font-medium underline underline-offset-4">
          Review invitation
        </Link>
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground"
          onClick={() => {
            try {
              localStorage.removeItem(PENDING_INVITE_STORAGE_KEY);
            } catch {
              /* ignore */
            }
            window.dispatchEvent(new Event(CHANGED));
          }}
        >
          Dismiss
        </button>
      </span>
    </div>
  );
}
