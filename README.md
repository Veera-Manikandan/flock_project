# Flock Energy — Urja Meter API

A read-only API adapter project for the Urja Meter Ops portal. The service provides a clean API contract, validation, consistent errors, OpenAPI documentation, and a Playwright-based portal discovery workflow.

> **Implementation status:** the API server and documentation scaffold are provided, but the portal-specific data adapter is intentionally marked incomplete. The live portal could not be reached from the build environment, so internal endpoints, fields, units, and authentication behavior have not been invented. Complete `PROTOCOL.md` and the adapter after running the discovery script against the real portal.

## Architecture

- `src/server.js` — Express app, routes, validation, docs and shutdown handling.
- `src/portal-client.js` — isolated integration boundary for the legacy portal.
- `src/auth.js` — optional API-key protection for data routes.
- `scripts/discover-portal.js` — opens the portal in a browser, records same-origin requests and saves a local snapshot/HAR.
- `openapi.json` — OpenAPI 3.0.3 contract for the new API.
- `PROTOCOL.md` — investigation notes and evidence checklist.
- `REFLECTION.md` — reflection draft to personalize after completing the investigation.
- `tests/` — automated smoke test.

## Requirements

- Node.js 20+
- npm
- Network access to `https://urja-ops.flockenergy.tech`
- Portal credentials supplied by the assignment

## Install and configure

```bash
npm install
npx playwright install chromium
cp .env.example .env
```

Edit `.env` locally. Use the credentials supplied with your assignment. Do not commit `.env`, screenshots containing sensitive data, HAR files, cookies, or captured portal responses.

## Investigate the real portal first

```bash
npm run discover
```

A browser opens. If the automatic login selectors do not match the portal, complete login manually. Navigate through the normal read-only UI and record:

1. Meter list/search page and its visible fields.
2. A meter detail page and the identifier used in its URL or request.
3. Recent consumption view, time range, timestamps, and units.
4. Network hierarchy, if visible.
5. Whether the UI uses JSON/XHR/fetch requests, server-rendered HTML, or another normal mechanism.
6. How login/session expiry and errors behave.

Discovery output is written to `portal-discovery/`. It can contain private operational data and credentials/tokens in request metadata. Keep it local and out of Git. Do not probe hidden admin functions, bypass access controls, or modify data.

After discovery, update `PROTOCOL.md` with confirmed evidence, then implement the methods in `src/portal-client.js`. Prefer the portal's normal authenticated read-only requests when confirmed; otherwise use selectors grounded in the observed UI. Never guess undocumented endpoint paths.

## Run the API

```bash
npm run dev
```

Default base URL: `http://localhost:3000`

- Health: `GET /health`
- Swagger UI: `GET /docs`
- OpenAPI JSON: `GET /openapi.json`
- Meter list: `GET /api/v1/meters?page=1&limit=25&search=`
- Meter detail: `GET /api/v1/meters/{meterId}`
- Consumption: `GET /api/v1/meters/{meterId}/consumption?from=2026-01-01&to=2026-01-31`

If `API_KEY` is set, send `x-api-key: <your-key>` on data routes. The API currently returns `501 PORTAL_ADAPTER_INCOMPLETE` for data routes until the real portal integration is implemented; this is intentional and prevents fabricated results.

Example request:

```bash
curl http://localhost:3000/api/v1/meters \
  -H 'x-api-key: replace-with-a-long-random-local-key'
```

## API response conventions

Success responses use a `data` envelope. List responses also return `pagination`. Errors use a stable shape:

```json
{
  "error": {
    "code": "INVALID_QUERY",
    "message": "Invalid query parameters."
  }
}
```

## Design decisions and trade-offs

- **Node.js + Express:** aligns with a small integration service and the author's existing JavaScript skills.
- **Adapter boundary:** isolates portal-specific knowledge from public API routes so changes in the legacy portal do not leak into consumers.
- **Read-only by design:** only GET routes are exposed.
- **Validation:** query parameters are validated before making portal requests.
- **No fabricated fixtures:** the adapter reports an explicit incomplete status until real portal behavior is verified.
- **No persistent cache yet:** freshness rules should be chosen only after learning whether the portal data changes in real time and whether caching is allowed.
- **Playwright discovery:** useful for understanding a portal's regular UI and observing same-origin traffic. Captures are sensitive and remain local.
- **API key:** lightweight protection for a local demonstration, not a substitute for production identity management.

## Intentionally not included yet

- Portal-specific selectors/endpoints and normalized field mappings: require real browser investigation.
- Network hierarchy endpoint: optional extension and should follow observed data.
- Local full-dataset index and caching: omitted until data volume, freshness and portal terms are known.
- Production deployment and secret manager: not needed for a local take-home.
- Modern frontend: optional extension; prioritize a correct API and clear protocol notes.

## Tests

```bash
npm test
```

The included test checks service health. Add unit tests for field mapping, pagination, invalid dates, missing meters, portal timeouts, session expiry, and malformed portal responses after implementing the adapter.

## Before submitting

- [ ] Complete and manually test all three adapter methods against the actual portal.
- [ ] Replace the draft protocol notes with observed facts and examples.
- [ ] Update OpenAPI schemas to reflect the confirmed field names and units.
- [ ] Add tests for real response mappings and portal failure modes.
- [ ] Run `npm test` and verify all routes locally.
- [ ] Check `git status` and ensure `.env`, HAR files and discovery output are not committed.
- [ ] Push the source to a public GitHub repository.
- [ ] Read and personalize `REFLECTION.md`; be prepared to explain every design decision in the follow-up.

## Links to required documents

- [Portal protocol notes](./PROTOCOL.md)
- [OpenAPI specification](./openapi.json)
- [Reflection](./REFLECTION.md)
