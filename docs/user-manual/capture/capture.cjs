const { chromium } = require("playwright");
const { install, session } = require("./mock.cjs");
const fx = require("./fixtures.cjs");

const OUT = require("path").resolve(__dirname, "../images");
const BASE = "http://localhost:8181";
const only = process.argv.slice(2);

async function ctx(
  b,
  { uid = fx.ME, email, tour = false, tables, mobile = false, signedIn = true, yearId } = {},
) {
  const c = await b.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    isMobile: mobile,
    hasTouch: mobile,
  });
  await install(c, { uid, email, tables });
  await c.addInitScript(
    ([s, me, tour, signedIn, study, yearId]) => {
      if (sessionStorage.getItem("seeded")) return;
      sessionStorage.setItem("seeded", "1");
      if (signedIn) localStorage.setItem("sb-demo-auth-token", s);
      if (!tour) localStorage.setItem("tour:v3:" + me, "1");
      if (yearId) {
        for (const k of ["active-year:" + study, "year:" + study]) localStorage.setItem(k, yearId);
      }
    },
    [JSON.stringify(session(uid, email)), uid, tour, signedIn, fx.S, yearId ?? null],
  );
  const p = await c.newPage();
  p.on("pageerror", (e) => console.log("pageerror:", e.message.slice(0, 200)));
  return { c, p };
}
const settle = (p, ms = 1200) => p.waitForTimeout(ms);
const shot = (p, name, opts = {}) => p.screenshot({ path: `${OUT}/${name}.png`, ...opts });
const box = async (p, name, locator, pad = 12) => {
  const r = await locator.boundingBox();
  await p.screenshot({
    path: `${OUT}/${name}.png`,
    clip: {
      x: Math.max(0, r.x - pad),
      y: Math.max(0, r.y - pad),
      width: r.width + pad * 2,
      height: r.height + pad * 2,
    },
  });
};
async function open(p, path) {
  await p.goto(BASE + path);
  await p.getByRole("link", { name: "Dashboard" }).first().waitFor({ timeout: 20000 });
  await settle(p, 1500);
}

const shots = {
  async "01-sign-in"(b) {
    const { c, p } = await ctx(b, { signedIn: false });
    await p.goto(BASE + "/");
    await p.getByRole("button", { name: "Sign in" }).waitFor();
    await settle(p, 500);
    await shot(p, "01-sign-in", { clip: { x: 420, y: 150, width: 600, height: 560 } });
    await p.getByText("No account yet? Sign up").click();
    await settle(p, 300);
    await shot(p, "02-sign-up", { clip: { x: 420, y: 150, width: 600, height: 560 } });
    await c.close();
  },
  async "03-waiting"(b) {
    const { c, p } = await ctx(b, {
      uid: "99999999-0000-4000-8000-000000000099",
      email: "new.person@example.org",
    });
    await p.goto(BASE + "/");
    await p.getByText("Waiting for access").waitFor({ timeout: 20000 });
    await settle(p, 300);
    await shot(p, "03-waiting-for-access", { clip: { x: 420, y: 150, width: 600, height: 560 } });
    await c.close();
  },
  async "04-tour"(b) {
    const { c, p } = await ctx(b, { tour: true });
    await open(p, "/");
    await p.getByText("Welcome to Budget Tracker").waitFor();
    await settle(p, 600);
    await shot(p, "04-tour-welcome");
    await c.close();
  },
  async "05-dashboard"(b) {
    const { c, p } = await ctx(b);
    await open(p, "/");
    await shot(p, "05-dashboard");
    await shot(p, "06-dashboard-full", { fullPage: true });
    await p.getByRole("button", { name: "Switch year" }).first().click();
    await settle(p, 400);
    await shot(p, "08-year-switcher", { clip: { x: 0, y: 0, width: 720, height: 360 } });
    await p.keyboard.press("Escape");
    await p.getByRole("button", { name: "Record actuals" }).click();
    await settle(p, 500);
    await shot(p, "09-record-actuals-picker");
    await p.getByRole("option").filter({ hasText: "Supervisor transport #2" }).click();
    await settle(p, 1000);
    await shot(p, "10-record-actuals-form");
    await c.close();
  },
  async "11-activities"(b) {
    const { c, p } = await ctx(b);
    await open(p, "/activities");
    await shot(p, "11-activities");
    await p
      .getByRole("link", { name: /Quarterly refresher training/ })
      .first()
      .click();
    await settle(p, 1500);
    await shot(p, "12-activity-detail");
    await shot(p, "13-activity-detail-full", { fullPage: true });
    await p.getByRole("button", { name: "Create rounds" }).click();
    await settle(p, 500);
    await p.getByLabel("Number of rounds").fill("4");
    await settle(p, 300);
    await shot(p, "14-create-rounds");
    await p.keyboard.press("Escape");
    await settle(p, 300);
    await p.locator("li > button").filter({ hasText: "Kisumu" }).first().click();
    await settle(p, 800);
    await shot(p, "15-round-edit");
    await c.close();
  },
  async "16-activity-form"(b) {
    const { c, p } = await ctx(b);
    await open(p, "/activities");
    await p.getByRole("button", { name: "Activity", exact: true }).first().click();
    await settle(p, 500);
    await shot(p, "16-add-activity");
    await c.close();
  },
  async "17-budget"(b) {
    const { c, p } = await ctx(b);
    await open(p, "/budget");
    await shot(p, "17-budget");
    await p.locator('[data-tour="budget-add-line"]').first().click();
    await settle(p, 500);
    await shot(p, "18-add-line");
    await p.keyboard.press("Escape");
    await settle(p, 300);
    await p.getByRole("button", { name: "Line actions" }).first().click();
    await settle(p, 300);
    await shot(p, "19-line-menu");
    await p.keyboard.press("Escape");
    await p.getByText("Training venue hire").first().click();
    await settle(p, 1500);
    await shot(p, "20-line-detail", { fullPage: true });
    await c.close();
  },
  async "21-spending"(b) {
    const { c, p } = await ctx(b);
    await open(p, "/spending");
    await shot(p, "21-spending-by-line");
    await p.getByRole("tab", { name: /Needs action/ }).click();
    await settle(p, 600);
    await shot(p, "22-spending-needs-action");
    await p.getByRole("radio", { name: "All rows" }).click();
    await settle(p, 600);
    await shot(p, "23-spending-all-rows");
    await p.getByRole("radio", { name: "Calendar" }).click();
    await settle(p, 600);
    await shot(p, "24-spending-calendar");
    await c.close();
  },
  async "25-settings"(b) {
    const { c, p } = await ctx(b);
    await open(p, "/settings");
    await shot(p, "25-settings-year", { clip: { x: 0, y: 0, width: 1440, height: 560 } });
    for (const [tab, name] of [
      ["Years", "26-settings-years"],
      ["Sites", "27-settings-sites"],
      ["Import", "28-settings-import"],
      ["Export", "29-settings-export"],
      ["Audit log", "30-settings-audit"],
      ["Team", "31-settings-team"],
    ]) {
      await p.getByRole("tab", { name: tab, exact: true }).click();
      await settle(p, 800);
      await shot(p, name, { clip: { x: 0, y: 0, width: 1440, height: 560 } });
    }
    await p.getByRole("tab", { name: "Years", exact: true }).click();
    await settle(p, 500);
    await p.getByRole("button", { name: "Start a new year" }).click();
    await settle(p, 500);
    await shot(p, "32-new-year");
    await c.close();
  },
  async "33-closed"(b) {
    const { c, p } = await ctx(b);
    await open(p, "/");
    await p.getByRole("button", { name: "Switch year" }).first().click();
    await p
      .getByRole("menuitem", { name: /Year 1/ })
      .first()
      .click();
    await settle(p, 2000);
    await shot(p, "33-closed-year", { clip: { x: 0, y: 0, width: 1440, height: 320 } });
    await c.close();
  },
  async "34-mobile"(b) {
    const { c, p } = await ctx(b, { mobile: true });
    await open(p, "/");
    await shot(p, "34-mobile-dashboard");
    await c.close();
  },
};

(async () => {
  require("fs").mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch();
  for (const [k, fn] of Object.entries(shots)) {
    if (only.length && !only.includes(k)) continue;
    try {
      await fn(b);
      console.log("ok", k);
    } catch (e) {
      console.log("FAIL", k, e.message.split("\n")[0]);
    }
  }
  await b.close();
})();
