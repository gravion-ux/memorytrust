# MemoryTrust

MemoryTrust audits an AI agent's **memory store** — the files an agent writes when it
remembers things about a user or a project — and scores how much of that stored content
can be trusted.

It is a review aid, not a guarantee: it tells you where a human (or a stricter pipeline)
should look.

## Why it matters

Agent memory is usually written once and read many times, often without review. That makes
four failure modes common:

- **Claims with no evidence** — a memory that says "the user prefers X" with no source.
- **Stale facts** — a preference from two years ago that is still injected into every prompt.
- **Contradictions** — two files disagreeing about the same id.
- **Secrets and instruction-shaped text** — credentials, personal data, or text that tries to
  re-enter the agent as a prompt.

MemoryTrust reads the store, applies a catalogue of rules, and produces a trust score
(0–100, with a grade from A+ to F) plus a JSON or Markdown report.

## Install

Node.js 18 or newer. No runtime or dev dependencies — Node built-ins only.

```bash
npm install -g memorytrust
# or run it without installing
node src/cli.js audit ./memories
```

## Usage

```bash
memory-trust audit <path> [--json <out.json>] [--md <out.md>] [--fail-on <severity>]
             [--max-age <days>] [--now <iso-date>] [--quiet]
memory-trust rules [--json]
```

- `--json <file>` writes a stable JSON report (2-space indent).
- `--md <file>` writes a Markdown report.
- `--fail-on <severity>` sets the exit threshold (default `high`).
- `--max-age <days>` sets the freshness window (default 180).
- `--now <iso-date>` pins the reference time, useful for reproducible audits.
- `--quiet` suppresses the human summary on stdout.

Exit codes: `0` no findings at or above the threshold, `1` findings at or above it,
`2` usage error, `3` target missing or not a directory.

See [docs/USAGE.md](docs/USAGE.md) for the record format and library API, and
[docs/TRUST-RULES.md](docs/TRUST-RULES.md) for every rule in detail.

## Rule table

| ID | Category | Severity | Detects |
| --- | --- | --- | --- |
| MT-PROV-001 | provenance | high | record has no `source` at all |
| MT-PROV-002 | provenance | medium | `source` is a bare URL that is not archived or pinned |
| MT-PROV-003 | provenance | medium | `confidence` below 0.5 |
| MT-FRESH-001 | freshness | medium | `createdAt` is older than the freshness window |
| MT-FRESH-002 | freshness | high | `expiresAt` is in the past |
| MT-CONF-001 | conflict | high | same `id`, different `content` |
| MT-CONF-002 | conflict | medium | same `id`, same `content` (duplicate) |
| MT-SENS-001 | sensitivity | critical | private key block, AWS access key id, GitHub token, Slack token, `sk-` key |
| MT-SENS-002 | sensitivity | high | credential assignment with a non-placeholder value |
| MT-PRIV-001 | privacy | high | email address |
| MT-PRIV-002 | privacy | medium | phone number or credit-card-like number |
| MT-PRIV-003 | privacy | medium | third-party personal data without `consent: true` |
| MT-STRUCT-001 | structure | medium | required field `id` is missing or empty |
| MT-STRUCT-002 | structure | medium | required field `content` is missing or empty |
| MT-INJ-001 | injection | critical | instruction-shaped text aimed at an agent |
| MT-INJ-002 | injection | high | pipe-to-shell command (`curl ... | sh`) |

## Scoring

Each finding deducts weight from the trust score, capped at 100:

| Severity | Weight |
| --- | --- |
| critical | 20 |
| high | 10 |
| medium | 4 |
| low | 2 |
| info | 0 |

| Score | Grade | Meaning |
| --- | --- | --- |
| 0–9 | A+ | Excellent trust |
| 10–19 | A | Good trust |
| 20–34 | B | Fair trust |
| 35–49 | C | Needs work |
| 50–69 | D | Poor trust |
| 70–100 | F | Critical risk |

Evidence is redacted before it is written to a report, so a leaked secret is never printed
in full.

## CI

[![CI](https://github.com/gravion-ux/memorytrust/actions/workflows/ci.yml/badge.svg)](https://github.com/gravion-ux/memorytrust/actions/workflows/ci.yml)

The workflow runs `npm test` and `npm run check` on Node.js 18, 20 and 22.

## License

MIT — see [LICENSE](LICENSE).
