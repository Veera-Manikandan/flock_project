# PROTOCOL.md — Urja Meter Ops portal investigation

## Status

**Not yet verified against the live portal.** The assignment PDF identifies the portal as `https://urja-ops.flockenergy.tech` and says it provides smart-meter information, network location, and recent consumption. The portal could not be reached from the build environment during project preparation. The sections below are an investigation checklist, not claims about the portal's implementation.

## Data the assignment says is available

- Meter details
- Where a meter sits in the network
- Recent consumption

The exact field names, identifiers, units, pagination behavior, and available date ranges must be observed in the running portal.

## Investigation procedure

1. Open the portal in a normal browser and sign in using the assignment credentials.
2. Record the login URL, form fields, redirects, and what indicates a successful login.
3. Open browser developer tools → Network. Filter to Fetch/XHR and clear the log.
4. Search for a meter. Record the request method, path, query parameters, response content type, and a redacted example response.
5. Open one meter. Identify the stable meter identifier and fields shown in the UI.
6. Open its consumption view. Record time filters, timestamps, units, and whether data is paginated or aggregated.
7. Inspect the network/location navigation, if available, and note parent-child relationships and missing/inconsistent data.
8. Refresh or allow the session to expire only through normal UI behavior to observe how the portal handles authentication expiry.
9. Repeat key requests once to distinguish stable behavior from transient errors.
10. Do not attempt writes, exploit paths, bypass access controls, or access data beyond the account's normal permissions.

## Confirmed protocol findings

Fill this section with observed facts before submission.

- Login entry point:
- Authentication mechanism observed (e.g. cookie session; only state what Network confirms):
- Session lifetime / expiry behavior:
- Meter list request and pagination:
- Meter identifier:
- Meter detail request:
- Consumption request and date parameters:
- Consumption units and timestamp timezone:
- Network hierarchy representation:
- Error responses and status codes:
- Any portal quirks:
- Evidence captured (redacted HAR/screenshot notes kept locally, not committed):

## Adapter mapping

Map portal response fields into the public API only after observing the source.

| Public API field | Portal source field | Transformation / units | Verified? |
|---|---|---|---|
| `id` | TBD | Stable meter identifier | No |
| `name` | TBD | TBD | No |
| `location` | TBD | Preserve hierarchy/labels | No |
| `consumption[].timestamp` | TBD | Normalize to ISO 8601 with timezone | No |
| `consumption[].value` | TBD | Numeric value only if source supports it | No |
| `consumption[].unit` | TBD | Preserve source unit | No |

## Security and privacy

- Keep credentials in environment variables.
- Do not commit cookies, authorization headers, tokens, full HAR files, or real customer/meter data.
- Redact IDs and values in any examples shared publicly unless the assignment explicitly designates them as synthetic.
- Use only read-only interactions available to the supplied account.
