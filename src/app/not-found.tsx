import Link from "next/link";
import { CenteredPage, StatusNumber } from "@/components/centered-page";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <CenteredPage>
      <div className="space-y-5 text-center">
        <StatusNumber>404</StatusNumber>
        <h1 className="font-display text-4xl">Nothing lives here</h1>
        <p className="text-muted-foreground">
          The page or short link you are looking for doesn&apos;t exist. Check the address for typos.
        </p>
        <div className="flex justify-center gap-2 pt-2">
          <Button asChild>
            <Link href="/">Back home</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/demo">See the demo</Link>
          </Button>
        </div>
      </div>
    </CenteredPage>
  );
}
