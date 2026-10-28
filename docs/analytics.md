# Analytics: comparison and unique visitors

## Compare to the previous period

On a link's analytics page, **Compare to previous period** (on by default, hidden for "All time") shows how
each number moved against the period of equal length just before it:

- The KPI cards show the percent change for clicks, unique visitors and bots.
- The clicks chart draws the previous period as a dashed line, bucket by bucket.
- Every row of the traffic-source, campaign, country, city, language, browser and OS lists shows `+n`, `−n`,
  `=` or `new` (hover for the percent). The comparison is for exactly the rows shown: a value that only
  appeared in the previous period does not become a row.

It follows the **Include bots** switch, and is off with `?compare=0`. Turning it off skips the extra queries.

## Unique visitors: what the number means

A visitor is identified by `sha256(IP + browser + that day's random salt)`. The salt changes every UTC day
and old salts are deleted ([retention](retention.md)), so the identifier cannot be matched across days,
by design. That has consequences, and the interface says so ("Unique visitors (per day)"):

- Someone who visits on three different days counts as **three** visitors. The number is the sum of each
  day's unique visitors, not the number of distinct people.
- People sharing an address and browser version (an office, a mobile network) can merge into one.
- One person on two devices, or whose address changes during the day, counts twice.
- Within one day it is reliable enough to answer "how many different people?", which is what it is for.

The small trend line on the card is the per-day (or per-hour) count; in an hour bucket it only separates
people within that hour. If you need cross-day identity you need cookies, which Vialb deliberately does not use.
