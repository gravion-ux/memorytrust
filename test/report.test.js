'use strict';
// Tests for the JSON and Markdown report renderers.

const test = require('node:test');
const assert = require('node:assert/strict');
const { toJson, toMarkdown } = require('../src/report.js');
const { createFinding, summarize } = require('../src/findings.js');

const META = { target: 'memories', generatedAt: '2026-10-12T00:00:00.000Z' };

const FINDINGS = [
  createFinding({
    ruleId: 'MT-SENS-001',
    category: 'sensitivity',
    severity: 'critical',
    recordId: 'user-key',
    path: 'memories/user.md',
    line: 4,
    excerpt: 'The key is AKIAIOSFODNN7EXAMPLE',
    message: 'Content contains an AWS access key id.',
    remediation: 'Remove the secret and rotate the credential.'
  }),
  createFinding({
    ruleId: 'MT-PRIV-001',
    category: 'privacy',
    severity: 'high',
    recordId: 'user-email',
    path: 'memories/user.md',
    line: 7,
    excerpt: 'Reach the user at user@example.com',
    message: 'Content contains an email address.',
    remediation: 'Remove the email address.'
  })
];

test('toJson emits the documented root keys in order', () => {
  const payload = JSON.parse(toJson(FINDINGS, summarize(FINDINGS), META));
  assert.deepEqual(Object.keys(payload), ['tool', 'schemaVersion', 'target', 'generatedAt', 'summary', 'findings']);
  assert.equal(payload.tool, 'memorytrust');
  assert.equal(payload.target, 'memories');
  assert.equal(payload.generatedAt, '2026-10-12T00:00:00.000Z');
  assert.equal(payload.findings.length, 2);
});

test('toJson serialises finding keys in the documented order', () => {
  const payload = JSON.parse(toJson(FINDINGS, summarize(FINDINGS), META));
  assert.deepEqual(Object.keys(payload.findings[0]), [
    'ruleId', 'category', 'severity', 'recordId', 'path', 'line',
    'excerpt', 'message', 'remediation'
  ]);
});

test('toJson is pretty printed with a two space indent', () => {
  const text = toJson(FINDINGS, summarize(FINDINGS), META);
  assert.ok(text.includes('\n  "tool": "memorytrust"'));
});

test('toJson sorts findings by severity', () => {
  const payload = JSON.parse(toJson(FINDINGS, summarize(FINDINGS), META));
  assert.equal(payload.findings[0].severity, 'critical');
});

test('toJson redacts secret evidence', () => {
  const payload = JSON.parse(toJson(FINDINGS, summarize(FINDINGS), META));
  assert.ok(payload.findings[0].excerpt.includes('AKIA…MPLE'));
  assert.ok(!payload.findings[0].excerpt.includes('AKIAIOSFODNN7EXAMPLE'));
});

test('toMarkdown contains the documented sections and table headers', () => {
  const markdown = toMarkdown(FINDINGS, summarize(FINDINGS), META);
  assert.ok(markdown.includes('# Memory Trust Audit Report'));
  assert.ok(markdown.includes('- Target: `memories`'));
  assert.ok(markdown.includes('## Severity summary'));
  assert.ok(markdown.includes('| Severity | Count |'));
  assert.ok(markdown.includes('## Findings'));
  assert.ok(markdown.includes('| Severity | Rule | Record | Location | Message |'));
  assert.ok(markdown.includes('## Category breakdown'));
  assert.ok(markdown.includes('| Category | critical | high | medium | low | info | Count |'));
  assert.ok(markdown.includes('## Remediation'));
});

test('toMarkdown writes one remediation subsection per rule', () => {
  const markdown = toMarkdown(FINDINGS, summarize(FINDINGS), META);
  assert.ok(markdown.includes('### MT-SENS-001 — critical'));
  assert.ok(markdown.includes('### MT-PRIV-001 — high'));
  assert.ok(markdown.includes('Remove the secret and rotate the credential.'));
});

test('toMarkdown reports an empty result', () => {
  const markdown = toMarkdown([], summarize([]), META);
  assert.ok(markdown.includes('No findings.'));
  assert.ok(markdown.includes('Nothing to remediate.'));
});

test('toMarkdown redacts secret evidence', () => {
  const markdown = toMarkdown(FINDINGS, summarize(FINDINGS), META);
  assert.ok(markdown.includes('AKIA…MPLE'));
  assert.ok(!markdown.includes('AKIAIOSFODNN7EXAMPLE'));
});
