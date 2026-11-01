# Security Policy

## Supported versions

| Version | Supported |
| --- | --- |
| 0.1.x | Yes |

Older versions receive no security fixes; upgrade before filing a report.

## Reporting a vulnerability

Please report suspected vulnerabilities privately to the maintainer at
`security@gravion-ux.dev`. Do not open a public issue for a security problem.

Include a description, the affected version, a minimal reproduction (a memory file is
enough), and the impact you observed. You can expect an acknowledgement within a few
working days and a fix or mitigation plan once the report is confirmed.

## How secrets are handled in reports

- Finding evidence is passed through the redactor before it is stored in a finding or
  written to a report.
- Private key blocks are replaced with `[REDACTED PRIVATE KEY]`.
- Access keys, tokens and credential values are masked with a prefix/suffix hint
  (for example `AKIA…MPLE`); short values are masked completely as `…`.
- Placeholder values such as `your_api_key_here`, `changeme` and `<your-token>` are not
  treated as secrets and are left untouched.
- The CLI never prints a full secret in its human summary, and `--quiet` keeps stdout
  empty entirely.

Redaction reduces accidental disclosure; it is not a substitute for keeping secrets out
of a memory store in the first place.
