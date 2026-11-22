# Contributing to MemoryTrust

Thanks for helping! MemoryTrust audits an AI agent's **memory
store** — the files an agent writes when it remembers things about a
user or a project — and scores how much of that stored content can
be trusted. It is a review aid, not a guarantee: it tells you where
a human (or a stricter pipeline) should look.

The most valuable contributions are new audit rules, schema coverage
for more memory formats, and tests.

## Ground rules

- **Read-only by design.** The auditor reads a memory store and
  reports; it must never modify, "repair" or delete the content it
  audits.
- **Zero runtime dependencies — hard rule.** Node.js built-ins only.
- **Evidence with every finding.** A rule that cannot point at the
  exact stored content that triggered it does not ship.

## Development setup

Requires Node.js 18 or newer. There is nothing to install:

```bash
git clone https://github.com/gravion-ux/memorytrust.git
cd memorytrust
npm test
```

## Running the tests

```bash
npm run check   # syntax-check every source file
npm test        # the full suite
npm run audit   # run the auditor against this repository itself
```

CI runs the checks and the suite on Node 18, 20 and 22.

## Adding a rule

Rules live in `src/rules.js` and produce findings via
`src/findings.js`. A new rule needs:

1. A stable rule id and a plain-language explanation of the trust
   problem it detects.
2. Tests in `test/rules.test.js` and `test/findings.test.js`
   covering a store that triggers it and a store that must not.
3. Conservative defaults: a false accusation against healthy memory
   is worse than a missed edge case.

If you add a source file, add it to the `check` and `test` scripts
in `package.json` — both list files explicitly.

## Code style

- Plain Node.js, no build step; tests use the built-in `node --test`
  runner and live in `test/`.
- Comments explain *why* a rule scores the way it does.

## Pull request workflow

1. Fork and branch from `main`: `feat/<short-name>`,
   `fix/<short-name>`, `rule/<rule-id>`, `docs/<short-name>`.
2. Run `npm run check` and the full suite locally.
3. Open the PR against `main` with: what changed, why, how you
   tested it.
4. CI must be green. One logical change per PR.
