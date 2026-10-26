import { ImageIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Approximate mock-ups of how a shared link looks in WhatsApp, iMessage, Slack and X. They are drawn
 * from the same inputs the crawlers get (title, description, image, the short link's host), with each
 * app's habits for cutting text short. The apps change their looks now and then, so these are close, not exact.
 */
export interface SocialPreviewData {
  title: string;
  description: string;
  /** Host of the short link, e.g. `vialb.link`. Platforms show this, never the destination. */
  host: string;
  /** Full short URL, shown where an app prints the link itself. */
  shortUrl: string;
  siteName: string;
  /** `null` when the link has no preview image. */
  imageSrc: string | null;
  dark: boolean;
}

/** The 1200x630 image, or a placeholder in the shape the app would reserve for it. */
function Picture({ src, className }: { src: string | null; className?: string }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element -- a data: URI or a user-supplied https image
    <img src={src} alt="" className={cn("block aspect-[1200/630] w-full object-cover", className)} />
  ) : (
    <div
      className={cn("grid aspect-[1200/630] w-full place-items-center bg-black/10", className)}
      aria-hidden
    >
      <ImageIcon className="size-6 opacity-40" />
    </div>
  );
}

function Frame({ label, dark, children }: { label: string; dark: boolean; children: ReactNode }) {
  return (
    <figure className="space-y-2">
      <figcaption className="text-xs font-medium text-muted-foreground">{label}</figcaption>
      <div
        className={cn("rounded-xl p-4", dark ? "bg-[#0b141a] text-white" : "bg-[#efeae2] text-[#111b21]")}
        data-testid={`preview-${label.toLowerCase()}`}
      >
        {children}
      </div>
    </figure>
  );
}

export function WhatsAppPreview({ title, description, host, shortUrl, imageSrc, dark }: SocialPreviewData) {
  return (
    <Frame label="WhatsApp" dark={dark}>
      <div
        className={cn(
          "ml-auto w-full max-w-[19rem] rounded-lg p-1 shadow-sm",
          dark ? "bg-[#005c4b] text-[#e9edef]" : "bg-[#d9fdd3] text-[#111b21]",
        )}
      >
        <div className={cn("overflow-hidden rounded-md", dark ? "bg-black/20" : "bg-black/[0.06]")}>
          <Picture src={imageSrc} />
          <div className="space-y-0.5 px-2.5 py-2">
            <p className="line-clamp-2 text-[0.8rem] leading-snug font-medium">{title}</p>
            {description ? (
              <p className="line-clamp-2 text-xs leading-snug opacity-70">{description}</p>
            ) : null}
            <p className="text-[0.7rem] opacity-60">{host}</p>
          </div>
        </div>
        <p
          className={cn(
            "px-1.5 py-1 text-[0.8rem] break-all underline",
            dark ? "text-[#53bdeb]" : "text-[#027eb5]",
          )}
        >
          {shortUrl}
        </p>
      </div>
    </Frame>
  );
}

export function IMessagePreview({ title, host, imageSrc, dark }: SocialPreviewData) {
  return (
    <Frame label="iMessage" dark={dark}>
      <div
        className={cn(
          "w-full max-w-[16.5rem] overflow-hidden rounded-2xl",
          dark ? "bg-[#262629] text-white" : "bg-[#e9e9eb] text-black",
        )}
      >
        <Picture src={imageSrc} />
        <div className="space-y-0.5 px-3 py-2">
          <p className="line-clamp-2 text-[0.85rem] leading-snug font-semibold">{title}</p>
          <p className="text-xs opacity-60">{host}</p>
        </div>
      </div>
    </Frame>
  );
}

export function SlackPreview({ title, description, siteName, imageSrc, dark }: SocialPreviewData) {
  return (
    <Frame label="Slack" dark={dark}>
      <div className={cn("rounded-md p-3", dark ? "bg-[#1a1d21] text-[#d1d2d3]" : "bg-white text-[#1d1c1d]")}>
        <div className="flex gap-3">
          <div
            className={cn("w-1 shrink-0 rounded-full", dark ? "bg-[#565856]" : "bg-[#dddddd]")}
            aria-hidden
          />
          <div className="min-w-0 space-y-1">
            <p className="text-xs font-bold">{siteName}</p>
            <p
              className={cn(
                "line-clamp-2 text-[0.9rem] leading-snug font-bold",
                dark ? "text-[#1d9bd1]" : "text-[#1264a3]",
              )}
            >
              {title}
            </p>
            {description ? <p className="line-clamp-3 text-[0.85rem] leading-snug">{description}</p> : null}
            {imageSrc ? <Picture src={imageSrc} className="mt-2 max-w-[22rem] rounded-md" /> : null}
          </div>
        </div>
      </div>
    </Frame>
  );
}

export function XPreview({ title, description, host, imageSrc, dark }: SocialPreviewData) {
  const border = dark ? "border-[#38444d]" : "border-[#cfd9de]";
  return (
    <Frame label="X" dark={dark}>
      <div
        className={cn(
          "w-full max-w-[28rem] overflow-hidden rounded-2xl border",
          border,
          dark ? "bg-black text-[#e7e9ea]" : "bg-white text-[#0f1419]",
        )}
      >
        {imageSrc ? (
          <div className="relative">
            <Picture src={imageSrc} />
            <p className="absolute bottom-2 left-2 max-w-[85%] truncate rounded bg-black/75 px-1.5 py-0.5 text-[0.8rem] text-white">
              {title}
            </p>
          </div>
        ) : (
          <div className="space-y-0.5 px-3 pt-3">
            <p className="line-clamp-1 text-[0.9rem] font-medium">{title}</p>
          </div>
        )}
        <div className="space-y-0.5 px-3 py-2">
          <p className={cn("text-[0.8rem]", dark ? "text-[#71767b]" : "text-[#536471]")}>{host}</p>
          {imageSrc ? null : description ? (
            <p className={cn("line-clamp-2 text-[0.8rem]", dark ? "text-[#71767b]" : "text-[#536471]")}>
              {description}
            </p>
          ) : null}
        </div>
      </div>
    </Frame>
  );
}

/** All four, in a grid. */
export function SocialPreviews(props: SocialPreviewData) {
  return (
    <div className="grid gap-4 md:grid-cols-2" data-testid="social-previews">
      <WhatsAppPreview {...props} />
      <IMessagePreview {...props} />
      <SlackPreview {...props} />
      <XPreview {...props} />
    </div>
  );
}
