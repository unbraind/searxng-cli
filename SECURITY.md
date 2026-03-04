# Security Policy

## Supported Versions

This project supports security updates on the default branch only.

## Reporting a Vulnerability

- Do not open public issues for sensitive vulnerabilities.
- Report privately through GitHub Security Advisories or direct maintainer contact.
- Include reproduction steps, impact, and affected versions.

## Security Controls

- Automated secret scanning runs in CI on push and pull requests.
- Full-history secret scans are required for release preparation (`bun run secrets:history`).
- Releases are manually approved and dry-run validated before publishing.
