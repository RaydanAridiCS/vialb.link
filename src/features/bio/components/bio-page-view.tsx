import Link from "next/link";
import type { CSSProperties } from "react";
import { APP_NAME } from "@/lib/constants";
import { SOCIAL_RULES } from "@/lib/bio";
import { PALETTES } from "@/lib/palettes";
import { cn } from "@/lib/utils";
import type { BioPageDto } from "@/server/services/bio.service";
import { SocialIcon } from "./social-icon";

/**
 * A link-in-bio page. Rendered on the server for visitors and, with `preview`, inside the editor.
 * Colours come from a fixed palette and are applied inline, so the page keeps its own look whatever
 * the app theme is.
 */
export function BioPageView({ page, preview = false }: { page: BioPageDto; preview?: boolean }) {
  const palette = PALETTES[page.theme];
  const name = page.displayName ?? `@${page.handle}`;
  const style = { background: palette.bg, color: palette.fg, "--bio-ring": palette.fg } as CSSProperties;
  const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--bio-ring)";

  return (
    <div
      style={style}
      className={cn("flex flex-col items-center px-5 py-10", preview ? "min-h-full" : "min-h-svh")}
      data-testid="bio-page"
    >
      <main className="flex w-full max-w-md flex-1 flex-col items-center text-center">
        {page.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- user-supplied remote avatar; next/image would need an allow-list
          <img
            src={page.avatarUrl}
            alt=""
            width={96}
            height={96}
            decoding="async"
            referrerPolicy="no-referrer"
            className="size-24 rounded-full object-cover"
            style={{ background: palette.muted }}
          />
        ) : (
          <div
            aria-hidden
            className="grid size-24 place-items-center rounded-full font-display text-3xl"
            style={{ background: palette.button, color: palette.buttonFg }}
          >
            {[...name.replace(/^@/, "")][0]?.toUpperCase()}
          </div>
        )}

        {preview ? (
          <p className="mt-4 font-display text-2xl">{name}</p>
        ) : (
          <h1 className="mt-4 font-display text-2xl">{name}</h1>
        )}
        {page.displayName ? (
          <p className="mt-0.5 text-sm" style={{ color: palette.muted }}>
            @{page.handle}
          </p>
        ) : null}
        {page.bio ? (
          <p
            className="mt-3 text-[0.95rem] leading-relaxed whitespace-pre-line"
            style={{ color: palette.fg }}
          >
            {page.bio}
          </p>
        ) : null}

        {page.socials.length > 0 ? (
          <ul className="mt-5 flex flex-wrap justify-center gap-3">
            {page.socials.map((social) => (
              <li key={`${social.platform}:${social.url}`}>
                {preview ? (
                  <span
                    className="grid size-10 place-items-center rounded-full"
                    style={{ background: palette.button, color: palette.buttonFg }}
                  >
                    <SocialIcon platform={social.platform} className="size-5" />
                    <span className="sr-only">{SOCIAL_RULES[social.platform].label}</span>
                  </span>
                ) : (
                  <a
                    href={social.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow ugc"
                    className={cn(
                      "grid size-10 place-items-center rounded-full transition-opacity hover:opacity-85",
                      focus,
                    )}
                    style={{ background: palette.button, color: palette.buttonFg }}
                  >
                    <SocialIcon platform={social.platform} className="size-5" />
                    <span className="sr-only">{SOCIAL_RULES[social.platform].label}</span>
                  </a>
                )}
              </li>
            ))}
          </ul>
        ) : null}

        {page.buttons.length > 0 ? (
          <ul className="mt-7 flex w-full flex-col gap-3">
            {page.buttons.map((button) => (
              <li key={button.id}>
                {preview ? (
                  <span
                    className="block w-full rounded-xl px-5 py-3.5 font-medium"
                    style={{ background: palette.button, color: palette.buttonFg }}
                  >
                    {button.label}
                  </span>
                ) : (
                  <a
                    href={button.href}
                    rel="nofollow"
                    className={cn(
                      "block w-full rounded-xl px-5 py-3.5 font-medium transition-transform hover:-translate-y-0.5",
                      focus,
                    )}
                    style={{ background: palette.button, color: palette.buttonFg }}
                  >
                    {button.label}
                  </a>
                )}
              </li>
            ))}
          </ul>
        ) : preview ? (
          <p className="mt-7 text-sm" style={{ color: palette.muted }}>
            Your buttons will appear here.
          </p>
        ) : null}
      </main>

      {page.showBadge ? (
        <footer className="mt-10 text-xs" style={{ color: palette.muted }}>
          {preview ? (
            <span>Powered by {APP_NAME}</span>
          ) : (
            <Link href="/" className={cn("underline underline-offset-4 hover:opacity-80", focus)}>
              Powered by {APP_NAME}
            </Link>
          )}
        </footer>
      ) : null}
    </div>
  );
}
