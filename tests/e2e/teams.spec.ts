import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { createLinkViaForm, uniqueCode } from "./helpers";

const PASSWORD = "correct-horse-battery";

/**
 * Submits the (already filled) sign-up form. Better Auth allows only a few sign-ups per ten seconds from one
 * address, so when this suite signs people up back to back it waits out the limit and tries again.
 */
async function submitSignUp(page: Page) {
  for (let attempt = 0; attempt < 4; attempt++) {
    await page.getByRole("button", { name: "Create account" }).click();
    const outcome = await Promise.race([
      page.waitForURL("**/dashboard", { timeout: 8000 }).then(() => "done" as const),
      page
        .getByText("Too many requests")
        .waitFor({ timeout: 8000 })
        .then(() => "limited" as const),
    ]).catch(() => "unknown" as const);
    if (outcome === "done") return;
    await page.waitForTimeout(11_000);
  }
  await page.waitForURL("**/dashboard");
}

/** A second person with their own browser: signs up and lands on their dashboard. */
async function newPerson(browser: Browser, name: string, email: string) {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await page.goto("/sign-up");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirm password").fill(PASSWORD);
  await submitSignUp(page);
  return { context, page, email };
}

const uniqueEmail = (who: string) => `${who}-${uniqueCode("t")}@example.com`.toLowerCase();

/** Creates a team as the signed-in user; the dashboard then shows it. */
async function createTeam(page: Page, name: string) {
  await page.goto("/dashboard/team");
  await page.getByLabel("Team name").fill(name);
  await page.getByRole("button", { name: "Create team" }).click();
  await expect(page.getByTestId("workspace-switcher")).toHaveAccessibleName(`Workspace: ${name}`);
}

/** Invites `email` and returns the link from the result box. */
async function invite(page: Page, email: string, role: "Admin" | "Editor" | "Viewer") {
  await page.goto("/dashboard/team");
  await page.getByLabel("Email address").fill(email);
  await page.locator("#invite-role").click();
  await page.getByRole("option", { name: role, exact: true }).click();
  await page.getByRole("button", { name: /Send invitation/ }).click();
  const result = page.getByTestId("invite-result");
  await expect(result).toBeVisible();
  return result.getByLabel("Invitation link").inputValue();
}

async function accept(page: Page, link: string) {
  await page.goto(link);
  await page.getByTestId("accept-invite").click();
  await page.waitForURL("**/dashboard");
}

/** The row for a link in the links table (its title link, not the short URL below it). */
const listed = (page: Page, code: string) => page.getByRole("link", { name: `/${code}`, exact: true });

async function closeAll(...contexts: BrowserContext[]) {
  await Promise.all(contexts.map((context) => context.close()));
}

test.describe("teams", () => {
  test.setTimeout(90_000);
  test("a team shares its links; roles decide who can change them; removal cuts access at once", async ({
    page,
    browser,
    request,
  }) => {
    const team = `Acme ${uniqueCode("team")}`;
    await createTeam(page, team);
    const { code, id } = await createLinkViaForm(page, { url: "https://example.com/team-secret" });

    const bobEmail = uniqueEmail("bob");
    const inviteLink = await invite(page, bobEmail, "Viewer");
    expect(inviteLink).toMatch(/\/invite\/[A-Za-z0-9_-]{20,}$/);

    const bob = await newPerson(browser, "Bob Viewer", bobEmail);
    await accept(bob.page, inviteLink);
    await expect(bob.page.getByTestId("workspace-switcher")).toHaveAccessibleName(`Workspace: ${team}`);

    // Bob sees the team's link and may look at it, but cannot create or change anything.
    await bob.page.goto("/dashboard/links");
    await expect(listed(bob.page, code)).toBeVisible();
    await expect(bob.page.getByRole("link", { name: "Create link" })).toHaveCount(0);
    await bob.page.goto(`/dashboard/links/${id}`);
    await expect(bob.page.getByRole("link", { name: "Edit" })).toHaveCount(0);
    await bob.page.goto(`/dashboard/links/${id}/edit`);
    await bob.page.waitForURL("**/dashboard/links");
    await bob.page.goto("/dashboard/links/new");
    await bob.page.waitForURL("**/dashboard/links");

    // His personal workspace is separate: the team's link is not there, and cannot be opened from there.
    await bob.page.getByTestId("workspace-switcher").click();
    await bob.page.getByTestId("workspace-option-personal").click();
    await bob.page.waitForURL("**/dashboard");
    await bob.page.goto("/dashboard/links");
    await expect(listed(bob.page, code)).toHaveCount(0);
    await bob.page.goto(`/dashboard/links/${id}`);
    await expect(bob.page.getByRole("heading", { name: "Nothing lives here" })).toBeVisible();

    // Promote Bob to editor: the buttons appear.
    await page.goto("/dashboard/team");
    await page.getByRole("combobox", { name: `Role for ${bobEmail}` }).click();
    await page.getByRole("option", { name: "Editor" }).click();
    await expect(page.getByTestId(`member-${bobEmail}`)).toContainText("Editor");
    await bob.page.getByTestId("workspace-switcher").click();
    await bob.page.getByTestId(`workspace-option-${team}`).click();
    await bob.page.waitForURL("**/dashboard");
    await expect(bob.page.getByRole("link", { name: "Create link" })).toBeVisible();
    await bob.page.goto(`/dashboard/links/${id}/edit`);
    await expect(bob.page.getByLabel("Title (optional)")).toBeVisible();

    // The short link works for everyone throughout.
    const visit = await request.get(`/${code}`, { maxRedirects: 0 });
    expect(visit.status()).toBe(302);

    // Remove Bob: his next request is back in his own workspace, and the link is out of reach.
    await page.goto("/dashboard/team");
    await page.getByRole("button", { name: `Remove ${bobEmail}` }).click();
    await expect(page.getByTestId(`member-${bobEmail}`)).toHaveCount(0);
    await bob.page.goto("/dashboard/links");
    await expect(bob.page.getByTestId("workspace-switcher")).toHaveAccessibleName("Workspace: Personal");
    await expect(listed(bob.page, code)).toHaveCount(0);
    await bob.page.goto(`/dashboard/links/${id}`);
    await expect(bob.page.getByRole("heading", { name: "Nothing lives here" })).toBeVisible();

    // The link itself stays with the team.
    await page.goto(`/dashboard/links/${id}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(code);
    await closeAll(bob.context);
  });

  test("an invitation only works for the address it was sent to", async ({ page, browser }) => {
    await createTeam(page, `Private ${uniqueCode("team")}`);
    const link = await invite(page, uniqueEmail("invitee"), "Editor");

    const stranger = await newPerson(browser, "Stranger", uniqueEmail("stranger"));
    await stranger.page.goto(link);
    await expect(stranger.page.getByText("different email address")).toBeVisible();
    await expect(stranger.page.getByTestId("accept-invite")).toHaveCount(0);
    await closeAll(stranger.context);
  });

  test("someone without an account is offered the invitation again after signing up", async ({
    page,
    browser,
  }) => {
    const team = `Welcome ${uniqueCode("team")}`;
    await createTeam(page, team);
    const email = uniqueEmail("newbie");
    const link = await invite(page, email, "Viewer");

    const visitor = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const v = await visitor.newPage();
    await v.goto(link);
    await expect(v.getByText("You've been invited to a team")).toBeVisible();
    await v.getByRole("link", { name: "Create account" }).click();
    await v.getByLabel("Name").fill("Newbie");
    await v.getByLabel("Email").fill(email);
    await v.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await v.getByLabel("Confirm password").fill(PASSWORD);
    await submitSignUp(v);

    await expect(v.getByTestId("pending-invite")).toBeVisible();
    await v.getByRole("link", { name: "Review invitation" }).click();
    await expect(v.getByRole("heading", { name: `Join ${team}` })).toBeVisible();
    await v.getByTestId("accept-invite").click();
    await v.waitForURL("**/dashboard");
    await expect(v.getByTestId("pending-invite")).toHaveCount(0);
    await expect(v.getByTestId("workspace-switcher")).toHaveAccessibleName(`Workspace: ${team}`);
    await closeAll(visitor);
  });

  test("an invitation can be cancelled, and then no longer works", async ({ page, browser }) => {
    await createTeam(page, `Cancel ${uniqueCode("team")}`);
    const email = uniqueEmail("late");
    const link = await invite(page, email, "Viewer");
    await page.getByRole("button", { name: `Cancel invitation for ${email}` }).click();
    await expect(page.getByTestId(`invite-${email}`)).toHaveCount(0);

    const late = await newPerson(browser, "Late", email);
    await late.page.goto(link);
    await expect(late.page.getByText("This invitation can't be used")).toBeVisible();
    await closeAll(late.context);
  });

  test("the only owner cannot leave, and an unknown invitation says so", async ({ page }) => {
    await createTeam(page, `Solo ${uniqueCode("team")}`);
    await page.getByRole("button", { name: "Leave team" }).click();
    await page.getByRole("button", { name: "Leave", exact: true }).click();
    await expect(page.getByText(/only owner/i).first()).toBeVisible();

    await page.goto("/invite/this-token-does-not-exist-at-all");
    await expect(page.getByText("This invitation can't be used")).toBeVisible();
  });

  test("an API key acts in the workspace it was made in", async ({ page, request }) => {
    const team = `Keys ${uniqueCode("team")}`;
    await createTeam(page, team);
    await page.goto("/dashboard/api-keys");
    await page.getByLabel("Name").fill("team key");
    await page.getByRole("button", { name: "Create key" }).click();
    const secret = (await page.getByTestId("api-key-secret").textContent())?.trim() ?? "";
    const code = uniqueCode("api");
    const created = await request.post("/api/v1/links", {
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      data: { url: "https://example.com/from-team-key", code },
    });
    expect(created.status()).toBe(201);

    await page.goto("/dashboard/links");
    await expect(listed(page, code)).toBeVisible();
    await page.getByTestId("workspace-switcher").click();
    await page.getByTestId("workspace-option-personal").click();
    await page.waitForURL("**/dashboard");
    await page.goto("/dashboard/links");
    await expect(listed(page, code)).toHaveCount(0);
  });

  test("deleting an account is blocked for the only owner of a shared team, and the team's links outlive their creator", async ({
    browser,
    request,
  }) => {
    const dana = await newPerson(browser, "Dana Owner", uniqueEmail("dana"));
    const team = `Handover ${uniqueCode("team")}`;
    await createTeam(dana.page, team);
    const { code, id } = await createLinkViaForm(dana.page, { url: "https://example.com/handover" });
    const erinEmail = uniqueEmail("erin");
    const link = await invite(dana.page, erinEmail, "Editor");
    const erin = await newPerson(browser, "Erin Member", erinEmail);
    await accept(erin.page, link);

    const deleteAccount = async () => {
      await dana.page.goto("/dashboard/settings");
      await dana.page.getByRole("button", { name: "Delete account" }).click();
      await dana.page.locator("#delete-password").fill(PASSWORD);
      await dana.page.getByRole("button", { name: "Delete forever" }).click();
    };

    // Blocked while Erin has no owner to take over.
    await deleteAccount();
    await expect(dana.page.getByText(/only owner of/).first()).toBeVisible();
    await dana.page.goto("/dashboard/team");
    await dana.page.getByRole("combobox", { name: `Role for ${erinEmail}` }).click();
    await dana.page.getByRole("option", { name: "Owner" }).click();
    await expect(dana.page.getByTestId(`member-${erinEmail}`)).toContainText("Owner");

    // Now it goes through, and the team keeps its link.
    await deleteAccount();
    await dana.page.waitForURL(/\/$/);
    await erin.page.goto("/dashboard/links");
    await expect(listed(erin.page, code)).toBeVisible();
    await erin.page.goto(`/dashboard/links/${id}`);
    await expect(erin.page.getByRole("heading", { level: 1 })).toContainText(code);
    expect((await request.get(`/${code}`, { maxRedirects: 0 })).status()).toBe(302);
    await closeAll(dana.context, erin.context);
  });

  test("the data export lists workspace memberships", async ({ page }) => {
    const team = `Export ${uniqueCode("team")}`;
    await createTeam(page, team);
    const response = await page.request.get("/api/app/me/export");
    expect(response.status()).toBe(200);
    const body = (await response.json()) as {
      workspaces: { name: string; personal: boolean; role: string }[];
    };
    expect(body.workspaces.find((w) => w.name === team)).toMatchObject({ personal: false, role: "owner" });
    expect(body.workspaces.some((w) => w.personal)).toBe(true);
  });
});
