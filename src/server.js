import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { z } from "zod";
import { apiKeyAuth } from "./auth.js";
import { errorHandler, notFoundHandler, AppError } from "./errors.js";
import { portalClient } from "./portal-client.js";

const app = express();
app.disable("x-powered-by");
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN === "*" || !process.env.CORS_ORIGIN
    ? true : process.env.CORS_ORIGIN.split(",").map(s => s.trim())
}));
app.use(express.json({ limit: "100kb" }));
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
app.use(apiKeyAuth);

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "flock-urja-meter-api",
    portalAdapter: "discovery-required"
  });
});

app.get("/openapi.json", (req, res) => res.sendFile(new URL("../openapi.json", import.meta.url).pathname));
app.get("/docs", (req, res) => {
  res.type("html").send(`<!doctype html>
<html><head><meta charset="utf-8"><title>Urja API docs</title>
<link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css"></head>
<body><div id="swagger-ui"></div>
<script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
<script>SwaggerUIBundle({url:'/openapi.json',dom_id:'#swagger-ui'});</script></body></html>`);
});

app.get("/api/v1/meters", async (req, res, next) => {
  try {
    const schema = z.object({
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(50),
      search: z.string().trim().max(100).optional().default("")
    });
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) throw new AppError(400, "INVALID_QUERY", "Invalid query parameters.", parsed.error.flatten());
    const result = await portalClient.getMeters(parsed.data);
    res.json({ data: result.items, pagination: result.pagination });
  } catch (e) { next(e); }
});

app.get("/api/v1/meters/:meterId", async (req, res, next) => {
  try {
    const meterId = z.string().trim().min(1).max(128).parse(req.params.meterId);
    const meter = await portalClient.getMeterById(meterId);
    if (!meter) throw new AppError(404, "METER_NOT_FOUND", `No meter found for id '${meterId}'.`);
    res.json({ data: meter });
  } catch (e) { next(e); }
});

app.get("/api/v1/meters/:meterId/consumption", async (req, res, next) => {
  try {
    const querySchema = z.object({
      from: z.string().date().optional(),
      to: z.string().date().optional()
    }).refine(v => !v.from || !v.to || v.from <= v.to, {
      message: "'from' must be on or before 'to'"
    });
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) throw new AppError(400, "INVALID_QUERY", "Dates must be YYYY-MM-DD and from must not exceed to.", parsed.error.flatten());
    const meterId = z.string().trim().min(1).max(128).parse(req.params.meterId);
    const result = await portalClient.getConsumption(meterId, parsed.data);
    res.json({ data: result.items, meterId: result.meterId, range: result.range, unit: result.unit });
  } catch (e) { next(e); }
});

app.use(notFoundHandler);
app.use(errorHandler);

const port = Number(process.env.PORT || 3000);
const server = app.listen(port, () => console.log(`Flock Urja API listening on http://localhost:${port}`));

async function shutdown(signal) {
  console.log(`${signal} received; shutting down`);
  server.close(async () => {
    await portalClient.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
