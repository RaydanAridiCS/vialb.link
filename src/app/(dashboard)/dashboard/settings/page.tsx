import type { Metadata } from "next";
import { PageHeader } from "@/components/app-shell";
import {
  ChangePasswordCard,
  DataCard,
  ProfileCard,
  TwoFactorCard,
} from "@/features/auth/components/account-settings";
import { EmailPreferencesCard } from "@/features/notifications/components/email-preferences-card";
import { requireSession } from "@/server/auth/session";
import { getContainer } from "@/server/container";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { session, actor } = await requireSession();
  const email = await getContainer().reports.emailSettings(actor);
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
        <EmailPreferencesCard
          weeklyReport={email.preferences.weeklyReport}
          brokenLinksEmail={email.preferences.brokenLinksEmail}
          reportsEnabled={email.reportsEnabled}
          brokenLinksEnabled={email.brokenLinksEnabled}
          mailConfigured={email.mailConfigured}
        />
        <DataCard />
      </div>
    </>
  );
}
