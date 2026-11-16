# Security Policy

## Supported Versions

Security fixes are applied to the latest version on the `main` branch.
Older commits and local demo deployments may not receive security updates.

## Reporting a Vulnerability

Please do not report security vulnerabilities in public issues, discussions, or
pull requests.

Report vulnerabilities privately to the project maintainers through the
repository's private security advisory feature. If that is unavailable,
contact the maintainers through a private GitHub message and include:

- A clear description of the vulnerability
- Steps to reproduce the issue
- The affected component or endpoint
- The potential impact
- Any suggested mitigation

Please do not include passwords, API keys, database URLs, session secrets,
payment credentials, private certificates, personal data, or production
customer information in a report.

## Response

Maintainers will acknowledge a report as soon as reasonably possible, verify
the issue, and coordinate a fix or mitigation. We will avoid publicly
disclosing details until affected users have had a reasonable opportunity to
update.

## Development and Demo Security

The development configuration includes demo-only authentication and payment
flows. It must not be used as a production security configuration. Keep `.env`
files, demo credentials, uploads, certificates, and cloud secrets outside
commits and public artifacts.
