import { timingSafeEqual } from "node:crypto";

export function apiKeyAuth(req, res, next) {
  // Health and docs are intentionally public for local review; data endpoints
  // are protected when API_KEY is configured.
  if (req.path === "/health" || req.path === "/openapi.json" || req.path === "/docs") {
    return next();
  }

  const expected = process.env.API_KEY;
  if (!expected) return next(); // convenient local development; set API_KEY for review

  const provided = req.get("x-api-key") || "";
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  const valid = a.length === b.length && timingSafeEqual(a, b);

  if (!valid) {
    return res.status(401).json({
      error: { code: "UNAUTHORIZED", message: "Provide a valid x-api-key header." }
    });
  }
  next();
}
