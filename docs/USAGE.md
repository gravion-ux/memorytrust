# Usage

MemoryTrust reads a directory of memory files, normalises each memory into a record,
applies the trust rules and reports what should not be trusted.

## CLI

```bash
memory-trust audit <path> [--json <out.json>] [--md <out.md>] [--fail-on <severity>]
             [--max-age <days>] [--now <iso-date>] [--quiet]
memory-trust rules [--json]
```

### `audit`

| Option | Meaning |
| --- | --- |
| `<path>` | Directory to scan. Must exist and be a directory. |
| `--json <file>` | Write the JSON report to `<file>`. |
| `--md <file>` | Write the Markdown report to `<file>`. |
| `--fail-on <severity>` | Threshold for a failing exit code: `critical`, `high`, `medium`, `low`, `info`. Default `high`. |
| `--max-age <days>` | Freshness window in days. Default `180`. |
| `--now <iso-date>` | Reference time for freshness and expiry checks. Default: the current time. |
| `--quiet` | Do not print the human summary. |

Exit codes:

| Code | Meaning |
| --- | --- |
| `0` | No findings at or above the threshold. |
| `1` | Findings at or above the threshold. |
| `2` | Usage error (message on stderr, prefixed `memory-trust: error: `). |
| `3` | Target missing or not a directory. |

Example:

```bash
memory-trust audit ./memories --json audit.json --md audit.md --fail-on medium
```

### `rules`

Prints the rule catalogue as text, or as a JSON array with `--json`.

## Memory files

The scanner reads `.md`, `.markdown`, `.json` and `.jsonl` files. `node_modules`, `.git`,
`dist`, `build` and `vendor` directories are skipped, files larger than 512 KiB are
skipped, and at most 2000 files are read per run.

### Markdown

An optional YAML-ish frontmatter block applies to every record in the file; each
non-empty body paragraph is one record. A file with only frontmatter produces no records.

```markdown
---
id: user-prefers-dark-mode
kind: preference
source: conversation:2026-10-12
createdAt: 2026-10-12
expiresAt: null
confidence: 0.8
tags: [ui]
sensitive: false
consent: true
---

The user prefers dark mode.

The user asked for the German locale last spring.
```

### JSON and JSONL

A `.json` file holds one object or an array of objects. A `.jsonl` file holds one JSON
object per line; a malformed line is skipped and counted, not fatal.

```json
{"id":"user-prefers-dark-mode","content":"The user prefers dark mode.","kind":"preference","source":"conversation:2026-10-12"}
```

## Record fields

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `id` | string | `record-<n>` | Required. |
| `content` | string | `''` | Required. |
| `kind` | string | `unknown` | One of `preference`, `fact`, `instruction`, `observation`, `unknown`. |
| `source` | string or null | `null` | Where the memory came from. |
| `createdAt` | ISO date string or null | `null` | When the memory was recorded. |
| `expiresAt` | ISO date string or null | `null` | When the memory stops being valid. |
| `confidence` | number 0..1 | `1` | How sure the store is. |
| `tags` | string[] | `[]` | Free-form labels. |
| `sensitive` | boolean | `false` | Marks the memory as sensitive. |
| `consent` | boolean | `false` | Whether the people in the memory agreed. |
| `path` | string | `''` | Relative path of the source file. |
| `line` | number | `1` | 1-based line of the record in that file. |

## Library API

```js
const { createAuditor, toMarkdown } = require('memorytrust');

const { records, findings, summary } = createAuditor('./memories', { maxAgeDays: 90 });
console.log(summary.grade, summary.score);
console.log(toMarkdown(findings, summary, { target: './memories' }));
```

Exported helpers include `loadRecords`, `loadRecordsDetailed`, `scanRecord`, `scanRecords`,
`RULES`, `ruleCatalogue`, `getRule`, `summarize`, `computeScore`, `gradeForScore`,
`sortFindings`, `createFinding`, `toJson`, `toMarkdown`, `redact`, `maskValue`,
`normaliseRecord` and `validateRecord`.

## Redaction

Evidence in findings and reports is redacted before it is stored: private key blocks
become `[REDACTED PRIVATE KEY]`, access keys and tokens keep only a prefix/suffix hint
(`AKIA…MPLE`), and short values are masked completely (`…`). Placeholder values such as
`your_api_key_here`, `changeme` or `<your-token>` are left untouched.
