'use strict';
// Tests for the scanner: locating evidence, running rules and detecting conflicts.

const test = require('node:test');
const assert = require('node:assert/strict');
const { scanRecord, scanRecords, locate } = require('../src/scanner.js');
const { normaliseRecord } = require('../src/schema.js');

const NOW = new Date('2026-10-12T00:00:00Z');

test('locate reports the line, column and excerpt of an index', () => {
  const result = locate('line one\nline two', 9);
  assert.equal(result.line, 2);
  assert.equal(result.column, 1);
  assert.equal(result.excerpt, 'line two');
});

test('locate handles an empty text and a missing index', () => {
  assert.deepEqual(locate('', 0), { line: 1, column: 1, excerpt: '' });
  assert.equal(locate('abc').line, 1);
});

test('scanRecord reports a finding with the record id, path and line', () => {
  const record = normaliseRecord({
    id: 'user-email',
    content: 'Reach the user at user@example.com.',
    source: 'conversation:2026-10-12'
  }, { path: 'memories/user.md', line: 5 });
  const findings = scanRecord(record, { records: [record], now: NOW, maxAgeDays: 180 });
  const privacy = findings.find((finding) => finding.ruleId === 'MT-PRIV-001');
  assert.ok(privacy);
  assert.equal(privacy.severity, 'high');
  assert.equal(privacy.recordId, 'user-email');
  assert.equal(privacy.path, 'memories/user.md');
  assert.equal(privacy.line, 5);
  assert.ok(privacy.remediation.length > 0);
});

test('scanRecord redacts secrets before storing evidence', () => {
  const record = normaliseRecord({
    id: 'user-key',
    content: 'The key is AKIAIOSFODNN7EXAMPLE for now.',
    source: 'conversation:2026-10-12'
  }, { path: 'memories/user.md', line: 2 });
  const findings = scanRecord(record, { records: [record], now: NOW, maxAgeDays: 180 });
  const sensitive = findings.find((finding) => finding.ruleId === 'MT-SENS-001');
  assert.ok(sensitive);
  assert.ok(sensitive.excerpt.includes('AKIA…MPLE'));
  assert.ok(!sensitive.excerpt.includes('AKIAIOSFODNN7EXAMPLE'));
});

test('scanRecord runs every non-conflict rule and skips conflict rules', () => {
  const record = normaliseRecord({
    id: 'user-plain',
    content: 'Reach the user at user@example.com.',
    source: 'conversation:2026-10-12'
  }, { path: 'memories/user.md', line: 1 });
  const findings = scanRecord(record, { records: [record], now: NOW, maxAgeDays: 180 });
  assert.ok(findings.length > 0);
  assert.ok(findings.some((finding) => finding.ruleId === 'MT-PRIV-001'));
  assert.ok(findings.every((finding) => finding.category !== 'conflict'));
});

test('scanRecords detects two records with the same id and different content', () => {
  const first = normaliseRecord({ id: 'same-id', content: 'The user prefers dark mode.', source: 'conversation:1' }, { path: 'a.md', line: 1 });
  const second = normaliseRecord({ id: 'same-id', content: 'The user prefers light mode.', source: 'conversation:2' }, { path: 'b.md', line: 1 });
  const findings = scanRecords([first, second], { now: NOW, maxAgeDays: 180 });
  const conflicts = findings.filter((finding) => finding.ruleId === 'MT-CONF-001');
  assert.equal(conflicts.length, 2);
  assert.ok(conflicts.every((finding) => finding.severity === 'high'));
});

test('scanRecords detects duplicate records with the same id and content', () => {
  const first = normaliseRecord({ id: 'dup-id', content: 'The user prefers dark mode.', source: 'conversation:1' }, { path: 'a.md', line: 1 });
  const second = normaliseRecord({ id: 'dup-id', content: 'The user prefers dark mode.', source: 'conversation:2' }, { path: 'b.md', line: 1 });
  const findings = scanRecords([first, second], { now: NOW, maxAgeDays: 180 });
  const duplicates = findings.filter((finding) => finding.ruleId === 'MT-CONF-002');
  assert.equal(duplicates.length, 2);
});

test('scanRecords returns findings sorted by severity', () => {
  const record = normaliseRecord({
    id: 'mixed',
    content: 'Mail user@example.com about key AKIAIOSFODNN7EXAMPLE.',
    source: 'conversation:2026-10-12'
  }, { path: 'memories/user.md', line: 1 });
  const findings = scanRecords([record], { now: NOW, maxAgeDays: 180 });
  assert.ok(findings.length >= 2);
  assert.equal(findings[0].severity, 'critical');
});

test('scanRecords honours the maxAgeDays option', () => {
  const record = normaliseRecord({
    id: 'old',
    content: 'The user prefers dark mode.',
    source: 'conversation:2026-10-12',
    createdAt: '2026-01-01'
  }, { path: 'memories/user.md', line: 1 });
  const strict = scanRecords([record], { now: NOW, maxAgeDays: 30 });
  const relaxed = scanRecords([record], { now: NOW, maxAgeDays: 365 });
  assert.ok(strict.some((finding) => finding.ruleId === 'MT-FRESH-001'));
  assert.ok(!relaxed.some((finding) => finding.ruleId === 'MT-FRESH-001'));
});

test('scanRecords honours the now option', () => {
  const record = normaliseRecord({
    id: 'expired',
    content: 'The trial ends in March.',
    source: 'conversation:2026-10-12',
    expiresAt: '2026-03-01'
  }, { path: 'memories/user.md', line: 1 });
  assert.ok(scanRecords([record], { now: new Date('2026-10-12T00:00:00Z') }).some((finding) => finding.ruleId === 'MT-FRESH-002'));
  assert.ok(!scanRecords([record], { now: new Date('2026-01-01T00:00:00Z') }).some((finding) => finding.ruleId === 'MT-FRESH-002'));
});
