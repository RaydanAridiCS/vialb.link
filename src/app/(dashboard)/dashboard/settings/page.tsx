import type { Metadata } from "next";
import { PageHeader } from "@/components/app-shell";
import {
  ChangePasswordCard,
  DataCard,
  ProfileCard,
  TwoFactorCard,
} from "@/features/auth/components/account-settings";
import { requireSession } from "@/server/auth/session";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { session } = await requireSession();
  return (
    <>
      <PageHeader title="Settings" description="Manage your account and security." />
      <div className="max-w-3xl space-y-6">
        <ProfileCard
          name={session.user.name}
          email={session.user.email}
          emailVerified={session.user.emailVerified}
        />
        <ChangePasswordCard />
        <TwoFactorCard enabled={session.user.twoFactorEnabled === true} />
        <DataCard />
      </div>
    </>
  );
}
