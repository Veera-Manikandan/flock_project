import "dotenv/config";
import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.PORTAL_BASE_URL;
const username = process.env.PORTAL_USERNAME;
const password = process.env.PORTAL_PASSWORD;
if (!baseUrl || !username || !password) {
  console.error("Missing PORTAL_BASE_URL, PORTAL_USERNAME or PORTAL_PASSWORD in .env");
  process.exit(1);
}

const outDir = path.resolve("portal-discovery");
await fs.mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({ recordHar: { path: path.join(outDir, "portal.har"), content: "embed" } });
const page = await context.newPage();
const requests = [];
const responses = [];

page.on("request", req => {
  const u = req.url();
  if (u.startsWith(baseUrl)) {
    requests.push({
      method: req.method(),
      url: u,
      resourceType: req.resourceType(),
      postDataPresent: Boolean(req.postData())
    });
  }
});
page.on("response", async res => {
  if (res.url().startsWith(baseUrl)) {
    responses.push({ status: res.status(), url: res.url(), contentType: res.headers()["content-type"] || "" });
  }
});

try {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
  const userSelector = process.env.PORTAL_USERNAME_SELECTOR || 'input[type="email"]';
  const passSelector = process.env.PORTAL_PASSWORD_SELECTOR || 'input[type="password"]';
  const submitSelector = process.env.PORTAL_SUBMIT_SELECTOR || 'button[type="submit"]';
  const userField = page.locator(userSelector).first();
  const passField = page.locator(passSelector).first();

  if (await userField.count() && await passField.count()) {
    await userField.fill(username);
    await passField.fill(password);
    await page.locator(submitSelector).first().click();
    await page.waitForLoadState("domcontentloaded").catch(() => {});
  } else {
    console.log("Login fields not found using configured selectors. Complete login manually in the opened browser.");
  }

  console.log("\nBrowser opened. Explore meter search, meter details, network hierarchy and consumption pages.");
  console.log("When finished, return to this terminal and press Enter.");
  await new Promise(resolve => {
    process.stdin.resume();
    process.stdin.once("data", resolve);
  });

  const snapshot = {
    capturedAt: new Date().toISOString(),
    currentUrl: page.url(),
    title: await page.title(),
    headings: await page.locator("h1,h2,h3").allTextContents().catch(() => []),
    links: await page.locator("a").evaluateAll(els => els.map(a => ({
      text: (a.innerText || "").trim(),
      href: a.href
    })).filter(a => a.text || a.href).slice(0, 300)),
    tables: await page.locator("table").evaluateAll(tables => tables.map(table => ({
      headers: Array.from(table.querySelectorAll("thead th")).map(x => x.innerText.trim()),
      sampleRows: Array.from(table.querySelectorAll("tbody tr")).slice(0, 5).map(row =>
        Array.from(row.querySelectorAll("th,td")).map(cell => cell.innerText.trim()))
    }))).catch(() => []),
    requests,
    responses
  };
  await fs.writeFile(path.join(outDir, "snapshot.json"), JSON.stringify(snapshot, null, 2));
  await fs.writeFile(path.join(outDir, "page.html"), await page.content());
  console.log(`\nSaved discovery artifacts to ${outDir}. Treat these as sensitive; do not commit them.`);
  console.log("Use the HAR and snapshot to document only confirmed behavior in PROTOCOL.md.");
} catch (error) {
  console.error("Discovery failed:", error.message);
  process.exitCode = 1;
} finally {
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
  process.stdin.pause();
}
