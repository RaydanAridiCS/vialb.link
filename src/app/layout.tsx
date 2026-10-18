import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Figtree, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import { Providers } from "@/components/providers";
import { APP_NAME, APP_TAGLINE } from "@/lib/constants";
import { env } from "@/lib/env";
import "./globals.css";

const figtree = Figtree({ variable: "--font-figtree", subsets: ["latin"] });
const bricolage = Bricolage_Grotesque({ variable: "--font-bricolage", subsets: ["latin"], axes: ["opsz"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(env.SITE_URL),
  title: { default: `${APP_NAME}: the open-source URL shortener`, template: `%s · ${APP_NAME}` },
  description: APP_TAGLINE,
  applicationName: APP_NAME,
  openGraph: { type: "website", siteName: APP_NAME, title: APP_NAME, description: APP_TAGLINE },
  twitter: { card: "summary_large_image", title: APP_NAME, description: APP_TAGLINE },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf8f5" },
    { media: "(prefers-color-scheme: dark)", color: "#151311" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Reading the nonce makes every page dynamic, which the nonce-based CSP requires.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${figtree.variable} ${bricolage.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans">
        <Providers nonce={nonce}>{children}</Providers>
      </body>
    </html>
  );
}
