# Conversion tracking

Count how many visits end in a goal on the destination: a sign-up, a purchase, a download. **Opt-in per
link** (edit page → Conversion tracking), and it needs a small change on the destination.

## How it works

1. When the link tracks conversions, every real redirect adds a random **`vclid`** to the destination:
   `https://shop.example/landing?x=1&vclid=Zm9vYmFyMTIzNDU2`. It is 12 random bytes, derived from nothing
   about the visitor, different on every click, and replaces any `vclid` already in the URL. It is stored on
   the click. Crawler previews and bots that are not redirected never get one.
2. The destination reports a conversion in either of two ways.

**From a page** (add once, call when the goal happens):

```html
<script src="https://YOUR-VIALB/api/convert/snippet.js"></script>
<script>
  vialb.convert({ value: 49.9, currency: "USD" }); // value and currency are optional
</script>
```

The snippet keeps the `vclid` of the landing URL in the **destination site's own `sessionStorage`** (Vialb sets
no cookies) and sends it with `navigator.sendBeacon`.

**From the destination's server** (store the `vclid` you received, then):

```
GET|POST https://YOUR-VIALB/api/convert?cid=<vclid>&value=49.90&currency=USD
```

Form or JSON bodies up to 1 KB are accepted too. A report always answers `204` (success, repeat, or unknown
id: ids cannot be probed) or `400` for malformed input, `429` when limited.

## What is stored

A `conversions` row: the link, the click, the time, and optionally an amount in cents and a currency. Nothing
else. Country, device and routing variant come from the click, and **one conversion per click** (a repeat is
ignored; the first amount stands). Deleting a click (retention) deletes its conversion. IP addresses are used
only for rate limiting and never stored.

## What is measured

- **Conversions** and **conversion rate** = conversions ÷ tracked clicks, as a **cohort by click time**: for
  the period you are looking at, how many of _its_ clicks converted. Clicks from the last hours may not have had
  time to convert yet; the page says so. Bots are excluded unless "Include bots" is on.
- **Value** per currency. Currencies are never added together.
- Rate by route (including A/B variants), country and device; compared with the previous period.
- `converted`, `conversion_value` and `conversion_currency` columns in the CSV export (the id itself is never exported).
- REST: `conversionsEnabled` on a link, and `conversions` in the stats response.

## Limits and abuse protection

The `vclid` is a bearer secret and is public to the visitor and the destination, so: anyone holding a click's id
can report one conversion for it. That is acceptable for measuring campaigns and **not** for reconciling
payments. Mitigations:

- the id format is checked before any lookup; amounts are non-negative, at most two decimals and below
  1,000,000,000; currencies come from a fixed list; value requires currency;
- one conversion per click; a click converts only within `CONVERSION_WINDOW_DAYS` (30) of the click; bot clicks
  and links that switched tracking off ignore reports;
- rate limits: 120 per minute per sending address and 1,200 per minute per link; bodies over 1 KB are refused.

A per-link signing secret is deliberately not part of this version.

## Privacy

No cookies, no fingerprinting, no IP storage, and the id is not derived from or linkable to the visitor by
Vialb. What changes: **the destination (and anything that logs its URLs, analytics tools, CDNs, referrers it
passes on) sees the `vclid`**. That is the feature, and the setting explains it before you turn it on. The
snippet's `sessionStorage` lives on the destination site, under its own consent obligations. Click ids and
conversions are removed with the clicks when you set a [retention period](retention.md).
