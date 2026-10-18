import { CopyButton } from "@/components/copy-button";

/** Dark terminal card with a copy button. */
export function Terminal({ lines, title = "bash" }: { lines: string[]; title?: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/40 text-left shadow-2xl">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5" aria-hidden>
            <span className="size-2.5 rounded-full bg-[#ff5f57]" />
            <span className="size-2.5 rounded-full bg-[#febc2e]" />
            <span className="size-2.5 rounded-full bg-[#28c840]" />
          </div>
          <span className="font-mono text-xs text-white/45">{title}</span>
        </div>
        <CopyButton
          value={lines.filter((l) => !l.startsWith("#")).join("\n")}
          label="Copy commands"
          variant="ghost"
          size="sm"
          className="h-7 text-white/60 hover:bg-white/10 hover:text-white"
        />
      </div>
      <pre className="overflow-x-auto p-5 font-mono text-[13px] leading-7">
        <code>
          {lines.map((line, i) =>
            line.startsWith("#") ? (
              <span key={i} className="block text-white/40">
                {line}
              </span>
            ) : (
              <span key={i} className="block text-white/90">
                <span className="text-primary select-none">$ </span>
                {line}
              </span>
            ),
          )}
        </code>
      </pre>
    </div>
  );
}
