# Weekly report and broken-links emails

Owners and admins of each workspace can get a weekly summary by email. **Off by default**
(`WEEKLY_REPORT_ENABLED`, or "Weekly report emails" in the admin page) and needs SMTP.

## Contents

Clicks against the previous week, daily-unique visitors, the top 5 links (with their change), top 5
referrers and top 5 countries. Bots, bio-page buttons and deleted links are left out. A workspace with no
counted clicks in either week gets nothing. Each email has an HTML and a plain-text body, all dynamic text
escaped, and a link to the settings page to opt out.

A second email lists links the [health monitor](link-health.md) flagged (not dismissed) when that monitor is on.

## Schedule

The admin chooses the day and hour (UTC): `REPORT_SEND_DAY` (0 = Sunday, default 1) and
`REPORT_SEND_HOUR_UTC` (default 8), also overridable in the admin page. The period is the 7 days ending at
that moment. The job runs every 15 minutes and sends when the moment has passed; after downtime it still
sends within 24 hours, and a longer-missed week is skipped (enabling the feature mid-week does not send last
Monday's report).

## No double sends

Before sending, a pass inserts a row in `email_deliveries` keyed by `(kind, workspace, person, period)`. The
primary key makes one pass the winner; a failure releases the claim so the next pass retries; a claim that
never finished can be taken over after an hour; a sent email is never claimable again. Together with the
[job lease](jobs.md), restarts and replicas cannot send twice. The guarantee is "at most once per period":
a crash between sending and recording could in theory drop an email, never repeat one.

## Opting out

Each person can switch off either email under **Settings → Email** (default: on), and send themselves a
preview of the report. Choices live in `user_preferences` and are part of the data export. Only owners and
admins of a workspace receive these emails; editors and viewers get nothing.
