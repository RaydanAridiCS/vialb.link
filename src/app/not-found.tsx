import Link from "next/link";
import { CenteredPage, StatusNumber } from "@/components/centered-page";
import { Button } from "@/components/ui/button";
import { getContainer } from "@/server/container";

/** The site's 404. Wording, name, button and accent follow the instance branding when one is set. */
export default async function NotFound() {
  const { branding } = await getContainer().settings.get();
  const accent = branding.accentColor
    ? ({ "--primary": branding.accentColor } as React.CSSProperties)
    : undefined;
  return (
    <CenteredPage>
      <div className="space-y-5 text-center" data-testid="not-found-page">
        {branding.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- an admin-chosen https image, not optimised by Next
          <img src={branding.logoUrl} alt={branding.brandName ?? ""} className="mx-auto max-h-12 max-w-48" />
        ) : null}
        <div style={accent}>
          <StatusNumber>404</StatusNumber>
        </div>
        <h1 className="font-display text-3xl">Nothing lives here</h1>
        <p className="text-muted-foreground">
          {branding.notFoundMessage ??
            "The page or short link you are looking for doesn't exist. Check the address for typos."}
        </p>
        <div className="flex justify-center gap-2 pt-2">
          <Button
            asChild
            style={
              branding.accentColor ? { backgroundColor: branding.accentColor, color: "#fff" } : undefined
            }
          >
            <Link href={branding.homeUrl ?? "/"}>{branding.homeLabel ?? "Back home"}</Link>
          </Button>
          {branding.homeUrl ? null : (
            <Button variant="outline" asChild>
              <Link href="/demo">See the demo</Link>
            </Button>
          )}
        </div>
      </div>
    </CenteredPage>
  );
}
