import Link from "next/link";
import { CenteredPage } from "@/components/centered-page";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <CenteredPage>
      <div className="space-y-4 text-center">
        <p className="text-6xl font-bold tracking-tighter">404</p>
        <h1 className="text-2xl font-semibold">Page not found</h1>
        <p className="text-muted-foreground">The page or link you are looking for doesn&apos;t exist.</p>
        <Button asChild>
          <Link href="/">Back home</Link>
        </Button>
      </div>
    </CenteredPage>
  );
}
