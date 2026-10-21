import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, type LegalSection } from "@/features/marketing/components/legal-page";
import { formatLifetime, getLegalFacts, LEGAL_UPDATED_AT } from "@/features/marketing/legal";
import { APP_NAME } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: `What ${APP_NAME} records, why, and what you can do about it.`,
};

export default async function PrivacyPage() {
  const facts = await getLegalFacts();
  const thirdParties = [
    facts.captcha
      ? {
          name: "Cloudflare Turnstile",
          use: "checks that a person, not a bot, is creating a link without an account.",
        }
      : null,
    facts.safeBrowsing
      ? {
          name: "Google Safe Browsing",
          use: "receives the destination URL of a new or edited link to check it for malware and phishing. It is never called when someone clicks a link.",
        }
      : null,
    facts.github
      ? { name: "GitHub", use: "lets you sign in with your GitHub account if you choose to." }
      : null,
    facts.google
      ? { name: "Google", use: "lets you sign in with your Google account if you choose to." }
      : null,
    facts.email
      ? {
          name: "An email delivery provider",
          use: "sends account emails such as password reset links to your email address.",
        }
      : null,
  ].filter((item) => item !== null);

  const sections: LegalSection[] = [
    {
      id: "visitors",
      title: "When someone clicks a short link",
      body: (
        <>
          <p>To show link owners useful statistics, each click records:</p>
          <ul>
            <li>the time of the click;</li>
            <li>
              an approximate location (country, region and city)
              {facts.cdnGeo || facts.localGeo
                ? ", worked out from the IP address at the moment of the click"
                : " when it is available"}
              ;
            </li>
            <li>the browser, operating system and device type, read from the browser&apos;s user agent;</li>
            <li>the website the visitor came from, without its query string;</li>
            <li>UTM campaign tags present on the link;</li>
            <li>the browser&apos;s preferred language, and whether the visitor looks like a bot;</li>
            <li>
              an anonymous visitor ID, made by hashing the IP address and user agent together with a value
              that changes every day.
            </li>
          </ul>
          <p>
            <strong>The visitor&apos;s IP address and full user agent are not stored.</strong> Because the
            hashing value changes daily, the visitor ID cannot be used to follow the same person from one day
            to the next. Visiting a short link does not set any cookies.
          </p>
        </>
      ),
    },
    {
      id: "account",
      title: "When you create an account",
      body: (
        <>
          <p>To run your account we store:</p>
          <ul>
            <li>your name and email address;</li>
            <li>your password, stored only as a hash;</li>
            <li>
              your sign-in sessions, including the IP address and user agent of the device that signed in;
            </li>
            <li>your two-factor authentication settings, if you turn that on;</li>
            <li>the links you create, their settings and their click statistics.</li>
          </ul>
        </>
      ),
    },
    ...(facts.anonymousLinks
      ? [
          {
            id: "anonymous",
            title: "Links created without an account",
            body: (
              <p>
                You can shorten a link without signing up. These links stop working after{" "}
                {formatLifetime(facts.anonLinkTtlHours)}. To limit abuse we keep a hashed form of the IP
                address that created the link, never the address itself. Your browser keeps a private token so
                you can add the link to an account later.
              </p>
            ),
          },
        ]
      : []),
    {
      id: "storage",
      title: "Cookies and browser storage",
      body: (
        <ul>
          <li>
            <strong>Session cookie.</strong> Set when you sign in, so you stay signed in. It is removed when
            you sign out.
          </li>
          <li>
            <strong>Theme.</strong> Your light or dark mode choice is saved in your browser.
          </li>
          {facts.anonymousLinks ? (
            <li>
              <strong>Link tokens.</strong> Tokens for links you created without an account are saved in your
              browser until they are added to an account.
            </li>
          ) : null}
        </ul>
      ),
    },
    {
      id: "third-parties",
      title: "Other services",
      body:
        thirdParties.length === 0 ? (
          <p>This instance does not send your data to any other service.</p>
        ) : (
          <>
            <p>This instance uses these services, and only for the purpose described:</p>
            <ul>
              {thirdParties.map((service) => (
                <li key={service.name}>
                  <strong>{service.name}</strong> {service.use}
                </li>
              ))}
            </ul>
            <p>Each of them handles data under its own privacy policy.</p>
          </>
        ),
    },
    {
      id: "choices",
      title: "Your choices",
      body: (
        <ul>
          <li>
            Download a copy of your account data and links at any time from{" "}
            <Link href="/dashboard/settings" className="underline underline-offset-4">
              Settings
            </Link>
            .
          </li>
          <li>
            Delete your account from Settings. This removes your account, your links and their click records.
          </li>
          <li>Disable or delete any link you own from your dashboard.</li>
        </ul>
      ),
    },
    {
      id: "changes",
      title: "Changes and contact",
      body: (
        <p>
          If this policy changes, the date at the top of this page changes with it. For questions about your
          data, contact the person or organization that runs this {APP_NAME} instance.
        </p>
      ),
    },
  ];

  return (
    <LegalPage
      title="Privacy policy"
      updatedAt={LEGAL_UPDATED_AT}
      intro={
        <p>
          {APP_NAME} is built to collect as little as possible. This page explains what is recorded when you
          use this instance, and what you can do about it.
        </p>
      }
      sections={sections}
      related={{ href: "/terms", label: "Terms of use" }}
    />
  );
}
