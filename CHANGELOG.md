# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-10-31

### Added

- Memory loader for markdown (YAML-ish frontmatter), JSON and JSONL memory files.
- Normalised memory record schema with required-field validation.
- Trust rule catalogue covering provenance, freshness, conflict, sensitivity, privacy,
  structure and injection findings.
- Scanner producing redacted findings with severity, path, line and remediation.
- Trust score and A+ to F grading.
- JSON and Markdown report renderers.
- `memory-trust` CLI with `audit` and `rules` commands and documented exit codes.
- Public JavaScript API with `createAuditor()`.
