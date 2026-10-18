"use client";

import { adminClient, twoFactorClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

/** Browser-side Better Auth client (same origin, cookie sessions). */
export const authClient = createAuthClient({
  plugins: [
    twoFactorClient({
      onTwoFactorRedirect() {
        // Called by Better Auth outside React, so no router is available here.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.href = "/two-factor";
      },
    }),
    adminClient(),
  ],
});

export const { useSession, signOut } = authClient;
