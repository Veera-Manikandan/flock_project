import { chromium } from "playwright";
import { AppError } from "./errors.js";

/**
 * PortalClient is intentionally a discovery-first adapter.
 *
 * The assignment requires reverse-engineering a real, read-only portal. Since
 * its live UI/API was not reachable from this build environment, we avoid
 * guessing internal endpoints or data fields. Run `npm run discover` and use
 * the captured network log / browser observations to implement the three
 * methods below against the portal's actual, normal authenticated interface.
 */
export class PortalClient {
  constructor() {
    this.baseUrl = process.env.PORTAL_BASE_URL;
    this.username = process.env.PORTAL_USERNAME;
    this.password = process.env.PORTAL_PASSWORD;
    this.browser = null;
    this.context = null;
    this.page = null;
    this.ready = false;
  }

  async connect() {
    if (this.ready) return;
    if (!this.baseUrl || !this.username || !this.password) {
      throw new AppError(503, "PORTAL_NOT_CONFIGURED",
        "Set PORTAL_BASE_URL, PORTAL_USERNAME and PORTAL_PASSWORD in .env.");
    }

    this.browser = await chromium.launch({ headless: true });
    this.context = await this.browser.newContext();
    this.page = await this.context.newPage();

    try {
      await this.page.goto(this.baseUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      const userSelector = process.env.PORTAL_USERNAME_SELECTOR || 'input[type="email"]';
      const passSelector = process.env.PORTAL_PASSWORD_SELECTOR || 'input[type="password"]';
      const submitSelector = process.env.PORTAL_SUBMIT_SELECTOR || 'button[type="submit"]';

      const userField = this.page.locator(userSelector).first();
      const passField = this.page.locator(passSelector).first();

      // If the first page is not a login form, the session may already be
      // authenticated or the portal may use a different entry flow.
      if (await userField.count() && await passField.count()) {
        await userField.fill(this.username);
        await passField.fill(this.password);
        await this.page.locator(submitSelector).first().click();
        await this.page.waitForLoadState("domcontentloaded").catch(() => {});
      }

      const successSelector = process.env.PORTAL_LOGIN_SUCCESS_SELECTOR;
      if (successSelector && !(await this.page.locator(successSelector).count())) {
        throw new AppError(502, "PORTAL_LOGIN_UNVERIFIED",
          "The configured login-success selector was not found. Verify the portal login flow and selectors.");
      }

      this.ready = true;
    } catch (error) {
      await this.close();
      if (error instanceof AppError) throw error;
      throw new AppError(502, "PORTAL_CONNECTION_FAILED",
        "Could not establish a portal session. Check credentials, selectors and network access.",
        { cause: error.message });
    }
  }

  async getMeters({ page = 1, limit = 50, search = "" } = {}) {
    await this.connect();
    // TODO after discovery: call the portal's real read-only data request or
    // parse its real meter table. Do not return guessed/sample records.
    throw new AppError(501, "PORTAL_ADAPTER_INCOMPLETE",
      "Meter listing is not implemented yet. Run `npm run discover`, document the real portal protocol in PROTOCOL.md, then implement this method.");
  }

  async getMeterById(meterId) {
    await this.connect();
    throw new AppError(501, "PORTAL_ADAPTER_INCOMPLETE",
      "Meter details are not implemented yet. Confirm the real identifier and detail request in the portal before implementing this method.",
      { meterId });
  }

  async getConsumption(meterId, { from, to } = {}) {
    await this.connect();
    throw new AppError(501, "PORTAL_ADAPTER_INCOMPLETE",
      "Consumption retrieval is not implemented yet. Confirm the real consumption request and units in the portal before implementing this method.",
      { meterId, from, to });
  }

  async close() {
    this.ready = false;
    try { await this.context?.close(); } catch {}
    try { await this.browser?.close(); } catch {}
    this.context = null;
    this.browser = null;
    this.page = null;
  }
}

export const portalClient = new PortalClient();
