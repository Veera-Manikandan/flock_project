import { chromium } from "playwright";
import { AppError } from "./errors.js";

const DEFAULT_HEADERS = {
  Accept: "application/json, text/plain, */*",
};

const asNumber = (value) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : value;
};

const normalizeDate = (value) => {
  if (!value) return null;

  const match = String(value).match(
    /^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?$/
  );

  if (match) {
    const [, day, month, year, hour = "00", minute = "00"] = match;
    return `${year}-${month}-${day}T${hour}:${minute}:00`;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const getDateOnly = (value) => {
  const normalized = normalizeDate(value);
  return normalized ? normalized.slice(0, 10) : null;
};

function decodeSvelteKitPayload(payload) {
  if (!payload || !Array.isArray(payload.nodes)) {
    return payload;
  }

  const decodedNodes = payload.nodes.map((node) => {
    if (!Array.isArray(node?.data) || node.data.length === 0) {
      return node;
    }

    const values = node.data;
    const resolving = new Set();

    function resolve(value) {
      if (Array.isArray(value)) {
        return value.map(resolve);
      }

      if (value && typeof value === "object") {
        const result = {};

        for (const [key, item] of Object.entries(value)) {
          result[key] = resolve(item);
        }

        return result;
      }

      return value;
    }

    function resolveReference(index) {
      if (
        !Number.isInteger(index) ||
        index < 0 ||
        index >= values.length ||
        resolving.has(index)
      ) {
        return values[index];
      }

      resolving.add(index);
      const result = resolve(values[index]);
      resolving.delete(index);
      return result;
    }

    const first = values[0];

    if (!first || typeof first !== "object" || Array.isArray(first)) {
      return { ...node, decodedData: values };
    }

    const result = {};

    for (const [key, reference] of Object.entries(first)) {
      result[key] =
        typeof reference === "number"
          ? resolveReference(reference)
          : resolve(reference);
    }

    return { ...node, decodedData: result };
  });

  return { ...payload, decodedNodes };
}

function collectObjects(value, result = [], seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) {
    return result;
  }

  seen.add(value);

  if (!Array.isArray(value)) {
    result.push(value);
  }

  for (const child of Object.values(value)) {
    collectObjects(child, result, seen);
  }

  return result;
}

function unwrapRows(payload) {
  if (Array.isArray(payload)) return payload;

  for (const key of ["items", "results", "meters", "rows"]) {
    if (Array.isArray(payload?.[key])) return payload[key];
    if (Array.isArray(payload?.data?.[key])) return payload.data[key];
  }

  if (Array.isArray(payload?.data)) return payload.data;

  if (Array.isArray(payload?.decodedNodes)) {
    for (const node of payload.decodedNodes) {
      const rows = unwrapRows(node?.decodedData);
      if (rows.length) return rows;
    }
  }

  const objects = collectObjects(payload);

  const candidate = objects.find((object) =>
    ["meterId", "meter_id", "serialNumber", "serialNo", "meterNo"].some(
      (key) => object[key] !== undefined
    )
  );

  return candidate ? [candidate] : [];
}

function normalizeMeter(meter) {
  return {
    ...meter,
    id:
      meter.id ??
      meter.meterId ??
      meter.meter_id ??
      meter.serialNumber ??
      meter.serialNo ??
      meter.meterNo ??
      null,
  };
}

function parseHierarchy(hierarchy) {
  if (!hierarchy) return [];

  if (Array.isArray(hierarchy)) {
    return hierarchy;
  }

  if (typeof hierarchy === "object") {
    return Object.entries(hierarchy).map(([level, value]) => ({
      level,
      ...(value && typeof value === "object" ? value : { name: value }),
    }));
  }

  return [];
}

export class PortalClient {
  constructor() {
    this.baseUrl = process.env.PORTAL_BASE_URL;
    this.username = process.env.PORTAL_USERNAME;
    this.password = process.env.PORTAL_PASSWORD;

    this.browser = null;
    this.context = null;
    this.page = null;
    this.ready = false;
    this.connecting = null;
  }

  async connect() {
    if (this.ready && this.page) return;

    if (this.connecting) {
      return this.connecting;
    }

    this.connecting = this._connect();

    try {
      await this.connecting;
    } finally {
      this.connecting = null;
    }
  }

  async _connect() {
    if (!this.baseUrl || !this.username || !this.password) {
      throw new AppError(
        503,
        "PORTAL_NOT_CONFIGURED",
        "Set PORTAL_BASE_URL, PORTAL_USERNAME and PORTAL_PASSWORD in .env."
      );
    }

    try {
      this.browser = await chromium.launch({ headless: true });
      this.context = await this.browser.newContext();
      this.page = await this.context.newPage();

      await this.page.goto(this.baseUrl, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });

      const userSelector =
        process.env.PORTAL_USERNAME_SELECTOR || 'input[type="email"]';

      const passSelector =
        process.env.PORTAL_PASSWORD_SELECTOR || 'input[type="password"]';

      const submitSelector =
        process.env.PORTAL_SUBMIT_SELECTOR || 'button[type="submit"]';

      const userField = this.page.locator(userSelector).first();
      const passField = this.page.locator(passSelector).first();

      const userCount = await userField.count();
      const passCount = await passField.count();

      if (userCount > 0 && passCount > 0) {
        await userField.fill(this.username);
        await passField.fill(this.password);

        const submitButton = this.page.locator(submitSelector).first();

        if (!(await submitButton.count())) {
          throw new AppError(
            502,
            "PORTAL_LOGIN_SELECTOR_NOT_FOUND",
            "Portal login fields were found, but the submit button was not. Configure PORTAL_SUBMIT_SELECTOR."
          );
        }

        await submitButton.click();

        await this.page
          .waitForLoadState("domcontentloaded")
          .catch(() => {});

        const successSelector = process.env.PORTAL_LOGIN_SUCCESS_SELECTOR;

        if (successSelector) {
          await this.page.locator(successSelector).waitFor({
            state: "visible",
            timeout: 15000,
          });
        } else {
          await this.page.waitForTimeout(1200);

          const stillHasPassword =
            (await this.page.locator(passSelector).count()) > 0;

          if (stillHasPassword) {
            throw new AppError(
              502,
              "PORTAL_LOGIN_NOT_CONFIRMED",
              "The portal login form is still present after submission. Verify credentials and PORTAL_*_SELECTOR settings."
            );
          }
        }
      } else {
        const successSelector = process.env.PORTAL_LOGIN_SUCCESS_SELECTOR;

        if (!successSelector) {
          throw new AppError(
            503,
            "PORTAL_LOGIN_FLOW_UNVERIFIED",
            "Could not find the configured username/password fields. Check the portal login page and configure the PORTAL_*_SELECTOR variables."
          );
        }

        await this.page.locator(successSelector).waitFor({
          state: "visible",
          timeout: 15000,
        });
      }

      this.ready = true;

      console.log("Portal login flow completed.");
      console.log("Portal current URL:", this.page.url());
    } catch (error) {
      await this.close();

      if (error instanceof AppError) throw error;

      throw new AppError(
        502,
        "PORTAL_CONNECTION_FAILED",
        "Could not establish a portal session. Check credentials, selectors and network access.",
        { cause: error.message }
      );
    }
  }

  async requestJson(path) {
    await this.connect();

    const result = await this.page.evaluate(async (requestPath) => {
      const response = await fetch(requestPath, {
        method: "GET",
        credentials: "include",
        headers: {
          Accept: "application/json, text/plain, */*",
        },
      });

      return {
        status: response.status,
        body: await response.text(),
      };
    }, path);

    if (result.status === 401 || result.status === 403) {
      throw new AppError(
        502,
        "PORTAL_AUTHENTICATION_FAILED",
        `The portal rejected the browser session with HTTP ${result.status}. Verify the login completed and that the account has access.`,
        { path, upstreamStatus: result.status }
      );
    }

    if (result.status < 200 || result.status >= 300) {
      throw new AppError(
        502,
        "PORTAL_UPSTREAM_ERROR",
        `Portal request failed with HTTP ${result.status}.`,
        { path, upstreamStatus: result.status }
      );
    }

    try {
      return JSON.parse(result.body);
    } catch {
      throw new AppError(
        502,
        "PORTAL_INVALID_RESPONSE",
        "The portal did not return valid JSON.",
        { path }
      );
    }
  }

  async getMeters({ page = 1, limit = 50, search = "" } = {}) {
    if (!Number.isInteger(Number(page)) || Number(page) < 1) {
      throw new AppError(400, "INVALID_PAGE", "page must be a positive integer.");
    }

    if (
      !Number.isInteger(Number(limit)) ||
      Number(limit) < 1 ||
      Number(limit) > 100
    ) {
      throw new AppError(
        400,
        "INVALID_LIMIT",
        "limit must be an integer between 1 and 100."
      );
    }

    const portalPage = Number(page);
    const pageSize = Number(limit);

    const path =
      `/portal/meters/search?q=${encodeURIComponent(search)}` +
      `&page=${portalPage}`;

    const raw = await this.requestJson(path);
    const payload = decodeSvelteKitPayload(raw);
    const rows = unwrapRows(payload).map(normalizeMeter);

    if (!rows.length) {
      throw new AppError(
        502,
        "PORTAL_METER_LIST_UNRECOGNIZED",
        "Could not identify meter rows in the portal search response. Inspect the real response and update the parser.",
        { path }
      );
    }

    const normalizedSearch = String(search).trim().toLowerCase();

    const filtered = normalizedSearch
      ? rows.filter((meter) =>
          JSON.stringify(meter).toLowerCase().includes(normalizedSearch)
        )
      : rows;

    return {
      items: filtered.slice(0, pageSize),
      page: portalPage,
      limit: pageSize,
      count: filtered.length,
    };
  }

  async getMeterById(meterId) {
    if (!meterId || !String(meterId).trim()) {
      throw new AppError(400, "INVALID_METER_ID", "meterId is required.");
    }

    const id = encodeURIComponent(String(meterId).trim());

    const path = `/meters/${id}/__data.json?x-sveltekit-invalidated=001`;

    const raw = await this.requestJson(path);
    const payload = decodeSvelteKitPayload(raw);
    const objects = collectObjects(payload);

    const meter = objects.find((object) => {
      const candidate =
        object.meterId ??
        object.meter_id ??
        object.id ??
        object.serialNumber ??
        object.serialNo;

      return candidate !== undefined && String(candidate) === String(meterId);
    });

    if (!meter) {
      throw new AppError(
        404,
        "METER_NOT_FOUND",
        `Meter '${meterId}' was not found in the portal response.`,
        { meterId }
      );
    }

    let geo = null;

    try {
      const geoResponse = await this.requestJson(`/portal/meters/${id}/geo`);
      const geoData = geoResponse?.data ?? geoResponse;

      if (geoData) {
        geo = {
          latitude: asNumber(geoData.latitude),
          longitude: asNumber(geoData.longitude),
        };
      }
    } catch (error) {
      if (error instanceof AppError && error.status === 404) {
        geo = null;
      } else {
        throw error;
      }
    }

    const result = normalizeMeter(meter);

    return {
      ...result,
      hierarchy: parseHierarchy(result.hierarchy),
      geo,
    };
  }

  async getConsumption(meterId, { from, to } = {}) {
    if (!meterId || !String(meterId).trim()) {
      throw new AppError(400, "INVALID_METER_ID", "meterId is required.");
    }

    if (!from || !to) {
      throw new AppError(
        400,
        "INVALID_DATE_RANGE",
        "Both from and to dates are required in YYYY-MM-DD format."
      );
    }

    const fromDate = new Date(`${from}T00:00:00Z`);
    const toDate = new Date(`${to}T00:00:00Z`);

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(from) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(to) ||
      Number.isNaN(fromDate.getTime()) ||
      Number.isNaN(toDate.getTime()) ||
      fromDate > toDate
    ) {
      throw new AppError(
        400,
        "INVALID_DATE_RANGE",
        "from and to must be valid YYYY-MM-DD dates, and from must not be after to."
      );
    }

    const id = encodeURIComponent(String(meterId).trim());
    const path = `/portal/meters/${id}/energy`;

    const payload = await this.requestJson(path);
    const readings = Array.isArray(payload?.data) ? payload.data : [];

    if (!readings.length && !Array.isArray(payload?.data)) {
      throw new AppError(
        502,
        "PORTAL_CONSUMPTION_UNRECOGNIZED",
        "Could not identify energy readings in the portal response.",
        { path }
      );
    }

    const items = readings
      .map((reading) => {
        const timestamp = normalizeDate(reading.timestamp);

        return {
          timestamp,
          kwh: asNumber(reading.kwh),
          kvah: asNumber(reading.kvah),
          voltR: asNumber(reading.voltR),
        };
      })
      .filter((reading) => {
        const date = getDateOnly(reading.timestamp);
        return date && date >= from && date <= to;
      })
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    return {
      meterId: String(meterId),
      from,
      to,
      count: items.length,
      items,
    };
  }

  async close() {
    this.ready = false;

    try {
      await this.context?.close();
    } catch {}

    try {
      await this.browser?.close();
    } catch {}

    this.context = null;
    this.browser = null;
    this.page = null;
  }
}

export const portalClient = new PortalClient();