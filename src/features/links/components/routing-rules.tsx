"use client";

import { ArrowDown, ArrowUp, ChevronDown, Plus, Split, X } from "lucide-react";
import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { LIMITS } from "@/lib/constants";
import {
  describeRule,
  isRoutingPlatform,
  normalizeCountries,
  pickRoute,
  ROUTING_PLATFORM_LABELS,
  ROUTING_PLATFORMS,
  type RoutingPlatform,
  type RoutingRule,
  type RoutingVariant,
  VARIANT_LETTERS,
  type Visitor,
} from "@/lib/routing";

const ANY = "any";
const UNKNOWN = "unknown";

/** "us, ca;gb" → ["US", "CA", "GB"]. Whatever is typed, only plausible codes survive to the form value. */
function parseCountries(text: string): string[] {
  return normalizeCountries(text.split(/[\s,;]+/));
}

interface Row {
  id: number;
  rule: RoutingRule;
}

export interface RoutingRulesProps {
  /** Rules the link already has. The editor owns them from here on and reports every change. */
  initial: RoutingRule[];
  onChange: (rules: RoutingRule[]) => void;
  /** The link's normal destination, shown by the tester when no rule applies. */
  destinationUrl: string;
  /** One message per rule (same order), e.g. from form validation. */
  errors?: (string | undefined)[];
  /** A problem with the rule set as a whole, such as two rules with the same conditions. */
  error?: string;
}

/**
 * Smart routing editor: ordered "if device / country, then send to URL" rules. The first matching
 * rule wins and anything else goes to the long URL. Like the UTM builder it is a collapsible card,
 * and it never owns the form value: every edit goes out through `onChange`.
 */
export function RoutingRules({ initial, onChange, destinationUrl, errors = [], error }: RoutingRulesProps) {
  const nextId = useRef(initial.length);
  const [rows, setRows] = useState<Row[]>(() => initial.map((rule, id) => ({ id, rule })));
  const [testPlatform, setTestPlatform] = useState<string>("desktop");
  const [testCountry, setTestCountry] = useState("");
  const idPrefix = useId();

  function commit(next: Row[]) {
    setRows(next);
    onChange(next.map((row) => row.rule));
  }

  /** Appends all the rules in one update (separate updates would each start from the same old list). */
  function add(...rules: RoutingRule[]) {
    const room = LIMITS.routingRulesMax - rows.length;
    if (room <= 0) return;
    commit([...rows, ...rules.slice(0, room).map((rule) => ({ id: nextId.current++, rule }))]);
  }

  function patch(id: number, rule: Partial<RoutingRule>) {
    commit(rows.map((row) => (row.id === id ? { ...row, rule: { ...row.rule, ...rule } } : row)));
  }

  function move(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    const [moved] = next.splice(index, 1);
    if (moved) next.splice(target, 0, moved);
    commit(next);
  }

  /** Turns a rule's split on (two even destinations, the first being the rule's URL) or off (keeping the first). */
  function setSplit(id: number, on: boolean) {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    if (on) {
      patch(id, {
        variants: [
          { url: row.rule.url, weight: 50 },
          { url: "", weight: 50 },
        ],
      });
    } else {
      const { variants, ...rest } = row.rule;
      commit(
        rows.map((r) => (r.id === id ? { ...r, rule: { ...rest, url: variants?.[0]?.url ?? rest.url } } : r)),
      );
    }
  }

  /** Changes one destination of a split; the rule's own URL always follows the first one. */
  function patchVariant(id: number, variantIndex: number, change: Partial<RoutingVariant>) {
    const row = rows.find((r) => r.id === id);
    if (!row?.rule.variants) return;
    const variants = row.rule.variants.map((v, i) => (i === variantIndex ? { ...v, ...change } : v));
    patch(id, { variants, url: variants[0]?.url ?? row.rule.url });
  }

  function setVariants(id: number, variants: RoutingVariant[]) {
    patch(id, { variants, url: variants[0]?.url ?? "" });
  }

  /** Equal shares that add up to exactly 100 (the first destinations take the remainder). */
  function evenShares(count: number): number[] {
    const base = Math.floor(100 / count);
    return Array.from({ length: count }, (_, i) => base + (i < 100 - base * count ? 1 : 0));
  }

  const hasPreset = (platform: RoutingPlatform) =>
    rows.some((row) => row.rule.platform === platform && !row.rule.countries?.length);
  const usesCountries = rows.some((row) => (row.rule.countries?.length ?? 0) > 0);

  const visitor: Visitor = {
    platform: isRoutingPlatform(testPlatform) ? testPlatform : null,
    country: parseCountries(testCountry)[0] ?? null,
  };
  const match = pickRoute(
    rows.map((row) => row.rule),
    visitor,
  );

  return (
    <details className="group rounded-2xl border bg-card shadow-paper" open={rows.length > 0 || undefined}>
      <summary className="flex cursor-pointer list-none items-center justify-between rounded-2xl px-6 py-5 font-display text-xl outline-none focus-visible:ring-4 focus-visible:ring-ring/25">
        <span>
          Smart routing
          {rows.length > 0 ? (
            <span className="ml-2 font-sans text-sm text-muted-foreground">
              {rows.length} {rows.length === 1 ? "rule" : "rules"}
            </span>
          ) : null}
        </span>
        <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="space-y-4 px-6 pb-6">
        <p className="text-sm text-muted-foreground">
          Send visitors to different places from one link, for example the App Store on iPhone and Google Play
          on Android. Rules are checked in order, the first match wins, and everyone else goes to the long
          URL.
        </p>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={hasPreset("ios") && hasPreset("android")}
            onClick={() => {
              add(
                ...(["ios", "android"] as const)
                  .filter((platform) => !hasPreset(platform))
                  .map((platform) => ({ platform, url: "" })),
              );
            }}
          >
            App Store + Google Play
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => add({ countries: [], url: "" })}>
            <Plus className="size-4" aria-hidden /> Add a rule
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              add({
                url: "",
                variants: [
                  { url: "", weight: 50 },
                  { url: "", weight: 50 },
                ],
              })
            }
          >
            <Split className="size-4" aria-hidden /> A/B test
          </Button>
        </div>

        {rows.length > 0 ? (
          <ol className="space-y-3" aria-label="Routing rules">
            {rows.map((row, index) => (
              <li key={row.id} className="space-y-3 rounded-xl border bg-background/60 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">
                    <span className="text-muted-foreground">Rule {index + 1}:</span> {describeRule(row.rule)}
                  </p>
                  <div className="flex shrink-0">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Move rule ${index + 1} up`}
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                    >
                      <ArrowUp className="size-4" aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Move rule ${index + 1} down`}
                      disabled={index === rows.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      <ArrowDown className="size-4" aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove rule ${index + 1}`}
                      onClick={() => commit(rows.filter((r) => r.id !== row.id))}
                    >
                      <X className="size-4" aria-hidden />
                    </Button>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor={`${idPrefix}-platform-${row.id}`}>Device</Label>
                    <Select
                      value={row.rule.platform ?? ANY}
                      onValueChange={(value) =>
                        patch(row.id, { platform: isRoutingPlatform(value) ? value : undefined })
                      }
                    >
                      <SelectTrigger
                        id={`${idPrefix}-platform-${row.id}`}
                        aria-label={`Device for rule ${index + 1}`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ANY}>Any device</SelectItem>
                        {ROUTING_PLATFORMS.map((platform) => (
                          <SelectItem key={platform} value={platform}>
                            {ROUTING_PLATFORM_LABELS[platform]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <CountriesField
                    id={`${idPrefix}-countries-${row.id}`}
                    label={`Countries for rule ${index + 1}`}
                    countries={row.rule.countries ?? []}
                    onChange={(countries) => patch(row.id, { countries })}
                  />
                </div>

                <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                  <Label htmlFor={`${idPrefix}-split-${row.id}`} className="font-normal">
                    Split these visitors between several destinations (A/B test)
                  </Label>
                  <Switch
                    id={`${idPrefix}-split-${row.id}`}
                    aria-label={`Split traffic for rule ${index + 1}`}
                    checked={row.rule.variants !== undefined}
                    onCheckedChange={(on) => setSplit(row.id, on)}
                  />
                </div>

                {row.rule.variants ? (
                  <SplitEditor
                    ruleNumber={index + 1}
                    variants={row.rule.variants}
                    idPrefix={`${idPrefix}-v${row.id}`}
                    onChange={(variantIndex, change) => patchVariant(row.id, variantIndex, change)}
                    onAdd={() => {
                      const current = row.rule.variants ?? [];
                      if (current.length >= LIMITS.routingVariantsMax) return;
                      const shares = evenShares(current.length + 1);
                      setVariants(row.id, [
                        ...current.map((v, i) => ({ ...v, weight: shares[i] ?? v.weight })),
                        { url: "", weight: shares[current.length] ?? 0 },
                      ]);
                    }}
                    onRemove={(variantIndex) => {
                      const current = (row.rule.variants ?? []).filter((_, i) => i !== variantIndex);
                      if (current.length < 2) return;
                      const shares = evenShares(current.length);
                      setVariants(
                        row.id,
                        current.map((v, i) => ({ ...v, weight: shares[i] ?? v.weight })),
                      );
                    }}
                    onEven={() => {
                      const current = row.rule.variants ?? [];
                      const shares = evenShares(current.length);
                      setVariants(
                        row.id,
                        current.map((v, i) => ({ ...v, weight: shares[i] ?? v.weight })),
                      );
                    }}
                  />
                ) : (
                  <div className="space-y-1.5">
                    <Label htmlFor={`${idPrefix}-url-${row.id}`}>Send them to</Label>
                    <Input
                      id={`${idPrefix}-url-${row.id}`}
                      type="url"
                      placeholder="https://apps.apple.com/app/…"
                      autoComplete="off"
                      value={row.rule.url}
                      aria-label={`Destination for rule ${index + 1}`}
                      onChange={(event) => patch(row.id, { url: event.target.value })}
                    />
                  </div>
                )}
                {errors[index] ? (
                  <p role="alert" className="text-sm text-destructive">
                    {errors[index]}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        ) : null}

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        {usesCountries ? (
          <p className="text-xs text-muted-foreground">
            Country rules need the server to know where visitors are: run behind a CDN such as Cloudflare with{" "}
            <span className="font-mono">TRUST_PROXY_GEO_HEADERS=true</span>, or set{" "}
            <span className="font-mono">GEOLITE2_DB_PATH</span>. Without it, those rules are skipped.
          </p>
        ) : null}

        {rows.length > 0 ? (
          <fieldset className="space-y-3 rounded-xl border border-dashed p-3">
            <legend className="px-1 text-sm font-medium">Try it</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`${idPrefix}-test-device`}>Visitor&apos;s device</Label>
                <Select value={testPlatform} onValueChange={setTestPlatform}>
                  <SelectTrigger id={`${idPrefix}-test-device`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROUTING_PLATFORMS.map((platform) => (
                      <SelectItem key={platform} value={platform}>
                        {ROUTING_PLATFORM_LABELS[platform]}
                      </SelectItem>
                    ))}
                    <SelectItem value={UNKNOWN}>Something else (bot, TV…)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${idPrefix}-test-country`}>Visitor&apos;s country</Label>
                <Input
                  id={`${idPrefix}-test-country`}
                  placeholder="US"
                  maxLength={2}
                  autoComplete="off"
                  value={testCountry}
                  onChange={(event) => setTestCountry(event.target.value)}
                />
              </div>
            </div>
            <p className="text-sm" data-testid="routing-test-result" aria-live="polite">
              {match ? (
                <>
                  Goes to <span className="font-mono break-all">{match.url || "(rule has no URL yet)"}</span>{" "}
                  <span className="text-muted-foreground">
                    (rule {match.index + 1}
                    {match.rule.variants
                      ? `; this is variant A of a split, other visitors get ${match.rule.variants
                          .slice(1)
                          .map((v, i) => `${VARIANT_LETTERS[i + 1]} (${v.weight}%)`)
                          .join(", ")}`
                      : ""}
                    )
                  </span>
                </>
              ) : (
                <>
                  Goes to <span className="font-mono break-all">{destinationUrl || "the long URL"}</span>{" "}
                  <span className="text-muted-foreground">(no rule matches)</span>
                </>
              )}
            </p>
          </fieldset>
        ) : null}
      </div>
    </details>
  );
}

/**
 * Country codes as free text ("US, CA"). The text is kept locally so a trailing comma or a half-typed
 * code survives; only the parsed list goes up to the form.
 */
function CountriesField({
  id,
  label,
  countries,
  onChange,
}: {
  id: string;
  label: string;
  countries: string[];
  onChange: (countries: string[]) => void;
}) {
  const [text, setText] = useState(countries.join(", "));
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>Countries (optional)</Label>
      <Input
        id={id}
        aria-label={label}
        placeholder="US, CA, GB"
        autoComplete="off"
        autoCapitalize="characters"
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          onChange(parseCountries(event.target.value));
        }}
      />
    </div>
  );
}

/** The destinations of one split: a letter, a URL, an optional name and a share each, adding up to 100%. */
function SplitEditor({
  ruleNumber,
  variants,
  idPrefix,
  onChange,
  onAdd,
  onRemove,
  onEven,
}: {
  ruleNumber: number;
  variants: RoutingVariant[];
  idPrefix: string;
  onChange: (index: number, change: Partial<RoutingVariant>) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onEven: () => void;
}) {
  const total = variants.reduce((sum, v) => sum + (Number.isFinite(v.weight) ? v.weight : 0), 0);
  return (
    <div className="space-y-3" data-testid={`split-editor-${ruleNumber}`}>
      <ul className="space-y-2" aria-label={`Destinations of rule ${ruleNumber}`}>
        {variants.map((variant, i) => {
          const letter = VARIANT_LETTERS[i] ?? "?";
          return (
            <li key={i} className="grid grid-cols-[auto_1fr_5.5rem_auto] items-end gap-2">
              <span
                className="grid size-9 place-items-center rounded-lg bg-accent font-mono text-sm font-medium text-accent-foreground"
                aria-hidden
              >
                {letter}
              </span>
              <div className="space-y-1.5">
                <Label htmlFor={`${idPrefix}-url-${i}`} className="sr-only">
                  Destination {letter}
                </Label>
                <Input
                  id={`${idPrefix}-url-${i}`}
                  type="url"
                  autoComplete="off"
                  placeholder={i === 0 ? "https://example.com/current-page" : "https://example.com/new-page"}
                  value={variant.url}
                  aria-label={`Destination ${letter} for rule ${ruleNumber}`}
                  onChange={(event) => onChange(i, { url: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${idPrefix}-w-${i}`} className="sr-only">
                  Share of {letter}
                </Label>
                <div className="relative">
                  <Input
                    id={`${idPrefix}-w-${i}`}
                    type="number"
                    min={1}
                    max={100}
                    step={1}
                    inputMode="numeric"
                    className="pr-7"
                    value={Number.isFinite(variant.weight) ? variant.weight : ""}
                    aria-label={`Share of ${letter} for rule ${ruleNumber}`}
                    onChange={(event) =>
                      onChange(i, {
                        weight: event.target.value === "" ? Number.NaN : Number(event.target.value),
                      })
                    }
                  />
                  <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-sm text-muted-foreground">
                    %
                  </span>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove destination ${letter} from rule ${ruleNumber}`}
                disabled={variants.length <= 2}
                onClick={() => onRemove(i)}
              >
                <X className="size-4" aria-hidden />
              </Button>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={variants.length >= LIMITS.routingVariantsMax}
            onClick={onAdd}
          >
            <Plus className="size-4" aria-hidden /> Add a destination
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onEven}>
            Even split
          </Button>
        </div>
        <p
          className={total === 100 ? "text-sm text-muted-foreground" : "text-sm text-destructive"}
          role={total === 100 ? undefined : "alert"}
          data-testid={`split-total-${ruleNumber}`}
        >
          {total === 100 ? "Shares add up to 100%" : `Shares add up to ${total}%; they must add up to 100%`}
        </p>
      </div>
      <p className="text-xs text-muted-foreground">
        Each visitor is sent to the same destination all day (no cookie needed), and analytics shows how many
        went to each. Destination A is the control.
      </p>
    </div>
  );
}
