import { cn } from "@/lib/utils";

/** Two-letter country chip. Used instead of flag emoji, which Windows does not render. */
export function CountryCode({ code, className }: { code: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-grid h-4 w-6 shrink-0 place-items-center rounded-[4px] bg-muted font-mono text-[9px] leading-none font-medium text-muted-foreground ring-1 ring-border",
        className,
      )}
    >
      {/^[A-Z]{2}$/.test(code) ? code : "??"}
    </span>
  );
}
