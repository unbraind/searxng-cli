# Security Policy

## Supported Versions

This project supports security updates on the default branch only.

## Reporting a Vulnerability

- Do not open public issues for sensitive vulnerabilities.
- Report privately through GitHub Security Advisories or direct maintainer contact.
- Include reproduction steps, impact, and affected versions.

## Security Controls

- GitHub secret scanning and push protection are enabled for the repository.
- Gitleaks scans run in CI on pushes and pull requests as an independent control.
- GitHub Actions must be pinned to full commit SHAs; version comments preserve update visibility.
- Full-history secret scans are required for release preparation (`bun run secrets:history`).
- Remote result-content enrichment only follows validated HTTP(S) URLs, rejects credentials and
  private literal targets, revalidates redirects, limits concurrency, and caps each response at 1 MiB.
- Releases are manually approved and dry-run validated before publishing.
