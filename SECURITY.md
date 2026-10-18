# Security Policy

## Supported versions

Security fixes are released for the latest minor version. Self-hosters should
track the `latest` Docker tag or the newest `vX.Y` tag.

| Version | Supported |
| ------- | --------- |
| latest  | ✅        |
| older   | ❌        |

## Reporting a vulnerability

**Please do not open public issues for security problems.**

Report vulnerabilities privately through
[GitHub Security Advisories](https://github.com/RaydanAridiCS/toolwright/security/advisories/new).
Include:

- a description of the issue and its impact,
- steps to reproduce (a proof of concept if possible),
- the affected version / commit and your deployment setup.

You can expect an acknowledgement within **3 business days** and a status update
within **10 business days**. Once a fix is released we will publish an advisory
and credit you, unless you prefer to stay anonymous.

## Scope and design notes

Things we especially care about:

- Bypassing password protection, access limits or expiry of a short link
- Leaking a protected link's destination (including to link-preview bots)
- XSS / HTML injection (destinations, titles, OG metadata, analytics values)
- Authentication, session, 2FA or API-key weaknesses; authorization bypass
- Open redirect abuse beyond the intended behaviour of a URL shortener

Security-relevant defaults are documented in
[docs/architecture.md](docs/architecture.md#security-model) and
[docs/configuration.md](docs/configuration.md). In particular, set
`TRUST_PROXY=true` only when ToolWright runs behind a reverse proxy you control.
