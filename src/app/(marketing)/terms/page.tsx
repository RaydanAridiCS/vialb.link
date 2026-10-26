import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, type LegalSection } from "@/features/marketing/components/legal-page";
import { formatLifetime, getLegalFacts, LEGAL_UPDATED_AT } from "@/features/marketing/legal";
import { APP_NAME, GITHUB_URL } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Terms of use",
  description: `The rules for using this ${APP_NAME} instance.`,
};

export default async function TermsPage() {
  const facts = await getLegalFacts();

  const sections: LegalSection[] = [
    {
      id: "service",
      title: "The service",
      body: (
        <p>
          This website runs {APP_NAME}, open-source software for short links, QR codes and click statistics.
          The software is published under the{" "}
          <a href={`${GITHUB_URL}/blob/main/LICENSE`} className="underline underline-offset-4">
            MIT license
          </a>
          . These terms cover your use of this website, which is run by its operator. By using it you agree to
          them.
        </p>
      ),
    },
    {
      id: "account",
      title: "Your account",
      body: (
        <ul>
          <li>Use an email address you control and keep your password private.</li>
          <li>You are responsible for what happens under your account.</li>
          <li>You can delete your account at any time from Settings.</li>
        </ul>
      ),
    },
    {
      id: "acceptable-use",
      title: "Acceptable use",
      body: (
        <>
          <p>Do not use this service to:</p>
          <ul>
            <li>link to malware, phishing or other content meant to harm or deceive people;</li>
            <li>link to anything that is illegal where you or your visitors are;</li>
            <li>send spam or hide the real destination of a link to mislead people;</li>
            <li>get around rate limits, blocked domains or other protections, or overload the service.</li>
          </ul>
          <p>The operator may disable links, block domains or suspend accounts that break these rules.</p>
        </>
      ),
    },
    {
      id: "content",
      title: "Your links",
      body: (
        <>
          <p>
            You keep ownership of the links, titles and preview text you add. You allow the operator to store
            them and show them as needed to run the service, for example when a link is opened or shared.
          </p>
          {facts.pixels ? (
            <p>
              If you add an advertising pixel to a link, you are responsible for having the right to use it,
              for following the rules of the ad platform and for any notice your own audience is owed. Do not
              use pixels to collect data about people who have declined.
            </p>
          ) : null}
          {facts.anonymousLinks ? (
            <p>
              Links created without an account stop working after {formatLifetime(facts.anonLinkTtlHours)}{" "}
              unless you add them to an account.
            </p>
          ) : null}
        </>
      ),
    },
    {
      id: "privacy",
      title: "Privacy",
      body: (
        <p>
          How data is handled is described in the{" "}
          <Link href="/privacy" className="underline underline-offset-4">
            privacy policy
          </Link>
          .
        </p>
      ),
    },
    {
      id: "availability",
      title: "Availability",
      body: (
        <p>
          The service is provided as is. It may change, be interrupted or stop, and links may stop working.
          Keep your own copy of anything important. You can export your data from Settings.
        </p>
      ),
    },
    {
      id: "changes",
      title: "Changes and contact",
      body: (
        <p>
          These terms may be updated. When they are, the date at the top of this page changes. For questions,
          contact the person or organization that runs this {APP_NAME} instance.
        </p>
      ),
    },
  ];

  return (
    <LegalPage
      title="Terms of use"
      updatedAt={LEGAL_UPDATED_AT}
      intro={
        <p>The short version: use it for honest links, keep your account safe, and keep your own backups.</p>
      }
      sections={sections}
      related={{ href: "/privacy", label: "Privacy policy" }}
    />
  );
}
