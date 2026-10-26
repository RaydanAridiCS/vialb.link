import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** Cool and neutral hues only; the same tag always gets the same colour. */
const TAG_HUES = [145, 170, 195, 220, 245, 270, 295, 320, 345] as const;

function hueFor(tag: string): number {
  let hash = 0;
  for (const char of tag) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  return TAG_HUES[hash % TAG_HUES.length] ?? TAG_HUES[0];
}

export function TagBadge({ tag, className, ...props }: { tag: string } & React.ComponentProps<typeof Badge>) {
  return (
    <Badge variant="secondary" className={cn("font-normal", className)} {...props}>
      <span
        aria-hidden
        className="size-1.5 rounded-full"
        style={{ backgroundColor: `oklch(0.65 0.14 ${hueFor(tag)})` }}
      />
      {tag}
    </Badge>
  );
}
