
import { timingSafeEqual } from "node:crypto";

const PUBLIC_PATHS = new Set([
  "/health",
  "/openapi.json",
  "/docs",
]);

export function apiKeyAuth(req, res, next) {
  if (PUBLIC_PATHS.has(req.path)) {
    return next();
  }

  const expected = (process.env.API_KEY || "").trim();

  if (!expected) {
    return res.status(500).json({
      error: {
        code: "API_KEY_NOT_CONFIGURED",
        message: "The server API key is not configured.",
      },
    });
  }

  const provided = req.get("x-api-key") || "";
  const expectedBuffer = Buffer.from(expected, "utf8");
  const providedBuffer = Buffer.from(provided.trim(), "utf8");

  const valid =
    expectedBuffer.length === providedBuffer.length &&
    timingSafeEqual(expectedBuffer, providedBuffer);

  if (!valid) {
    return res.status(401).json({
      error: {
        code: "UNAUTHORIZED",
        message: "Provide a valid x-api-key header.",
      },
    });
  }

  return next();
}
