# Security Baseline

## Implemented in the foundation

- API security headers via Helmet.
- Explicit CORS origin configuration.
- JSON request limit of 256 KB.
- API rate limiting.
- Zod validation at the workflow graph boundary.
- Error responses avoid stack traces.
- The AI mock accepts bounded input and cannot access the database or invoke actions.
- Secrets are supplied through environment variables and ignored by Git.

## Mandatory before production

- Password hashing and secure, rotated sessions.
- Server-side RBAC and organization ownership checks for every resource.
- MongoDB injection safeguards and repository-only data access.
- Encryption and redaction of integration credentials.
- Webhook signatures, replay controls, limits, and rate limits.
- SSRF protections for HTTP actions (scheme, DNS/IP, redirects, private ranges, timeouts, payload caps).
- CSRF/XSS design review based on the chosen session transport.
- Audit events that exclude secrets and sensitive payloads.
- Dependency scanning and production CORS/cookie configuration.
