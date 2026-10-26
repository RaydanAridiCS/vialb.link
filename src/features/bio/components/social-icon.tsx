import { Globe, Link2, Mail } from "lucide-react";
import {
  siFacebook,
  siGithub,
  siInstagram,
  siSpotify,
  siTiktok,
  siTwitch,
  siX,
  siYoutube,
} from "simple-icons";
import type { SocialPlatform } from "@/lib/bio";

/** lucide-react has no brand icons, so these come from simple-icons (CC0). It has no LinkedIn mark, so that one is a plain link icon. */
const BRAND_PATHS: Partial<Record<SocialPlatform, string>> = {
  instagram: siInstagram.path,
  tiktok: siTiktok.path,
  youtube: siYoutube.path,
  x: siX.path,
  github: siGithub.path,
  facebook: siFacebook.path,
  twitch: siTwitch.path,
  spotify: siSpotify.path,
};

export function SocialIcon({ platform, className }: { platform: SocialPlatform; className?: string }) {
  const path = BRAND_PATHS[platform];
  if (path) {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
        <path d={path} />
      </svg>
    );
  }
  if (platform === "email") return <Mail aria-hidden className={className} />;
  if (platform === "website") return <Globe aria-hidden className={className} />;
  return <Link2 aria-hidden className={className} />;
}
