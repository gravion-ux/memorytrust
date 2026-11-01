'use strict';
// Tests for finding construction, ordering, scoring and grading.

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  SEVERITIES,
  SEVERITY_WEIGHTS,
  severityRank,
  compareSeverity,
  createFinding,
  compareFindings,
  sortFindings,
  computeScore,
  gradeForScore,
  gradeLabel,
  summarize
} = require('../src/findings.js');

test('SEVERITIES are ordered from most to least severe', () => {
  assert.deepEqual(SEVERITIES, ['critical', 'high', 'medium', 'low', 'info']);
});

test('SEVERITY_WEIGHTS match the documented weights', () => {
  assert.deepEqual(SEVERITY_WEIGHTS, { critical: 20, high: 10, medium: 4, low: 2, info: 0 });
});

test('severityRank orders severities and compareSeverity agrees', () => {
  assert.ok(severityRank('critical') < severityRank('high'));
  assert.ok(severityRank('high') < severityRank('info'));
  assert.ok(compareSeverity('critical', 'medium') < 0);
  assert.ok(compareSeverity('low', 'critical') > 0);
});

test('createFinding normalises line and recordId', () => {
  const finding = createFinding({ ruleId: 'MT-PROV-001' });
  assert.equal(finding.line, 1);
  assert.equal(finding.recordId, 'unknown');
  const other = createFinding({ ruleId: 'MT-PROV-001', line: 0, recordId: '   ' });
  assert.equal(other.line, 1);
  assert.equal(other.recordId, 'unknown');
});

test('sortFindings orders by severity, path, line then rule id', () => {
  const findings = [
    createFinding({ ruleId: 'B', severity: 'medium', path: 'a.md', line: 2 }),
    createFinding({ ruleId: 'A', severity: 'medium', path: 'a.md', line: 2 }),
    createFinding({ ruleId: 'C', severity: 'critical', path: 'z.md', line: 9 }),
    createFinding({ ruleId: 'D', severity: 'medium', path: 'a.md', line: 1 })
  ];
  const sorted = sortFindings(findings);
  assert.deepEqual(sorted.map((finding) => finding.ruleId), ['C', 'D', 'A', 'B']);
});

test('compareFindings is a total order over the same finding', () => {
  const finding = createFinding({ ruleId: 'A', severity: 'high', path: 'a.md', line: 1 });
  assert.equal(compareFindings(finding, finding), 0);
});

test('computeScore sums weights and caps at 100', () => {
  assert.equal(computeScore([]), 0);
  assert.equal(computeScore([{ severity: 'critical' }, { severity: 'high' }]), 30);
  const many = Array.from({ length: 10 }, () => ({ severity: 'critical' }));
  assert.equal(computeScore(many), 100);
});

test('computeScore is deterministic for the same findings', () => {
  const findings = [{ severity: 'medium' }, { severity: 'low' }, { severity: 'critical' }];
  assert.equal(computeScore(findings), computeScore(findings));
});

test('gradeForScore follows the documented band boundaries', () => {
  assert.equal(gradeForScore(0), 'A+');
  assert.equal(gradeForScore(9), 'A+');
  assert.equal(gradeForScore(10), 'A');
  assert.equal(gradeForScore(19), 'A');
  assert.equal(gradeForScore(20), 'B');
  assert.equal(gradeForScore(34), 'B');
  assert.equal(gradeForScore(35), 'C');
  assert.equal(gradeForScore(49), 'C');
  assert.equal(gradeForScore(50), 'D');
  assert.equal(gradeForScore(69), 'D');
  assert.equal(gradeForScore(70), 'F');
  assert.equal(gradeForScore(100), 'F');
});

test('gradeLabel returns a human readable label', () => {
  assert.equal(typeof gradeLabel('A+'), 'string');
  assert.ok(gradeLabel('A+').length > 0);
  assert.equal(gradeLabel('unknown'), 'Unrated');
});

test('summarize counts findings by severity and category', () => {
  const findings = [
    createFinding({ ruleId: 'MT-SENS-001', category: 'sensitivity', severity: 'critical', recordId: 'a' }),
    createFinding({ ruleId: 'MT-PRIV-001', category: 'privacy', severity: 'high', recordId: 'a' }),
    createFinding({ ruleId: 'MT-FRESH-001', category: 'freshness', severity: 'medium', recordId: 'b' })
  ];
  const summary = summarize(findings);
  assert.equal(summary.total, 3);
  assert.equal(summary.bySeverity.critical, 1);
  assert.equal(summary.bySeverity.high, 1);
  assert.equal(summary.bySeverity.medium, 1);
  assert.equal(summary.bySeverity.low, 0);
  assert.equal(summary.byCategory.sensitivity, 1);
  assert.equal(summary.byCategory.privacy, 1);
  assert.equal(summary.affectedRecords, 2);
  assert.equal(summary.score, 34);
  assert.equal(summary.grade, 'B');
  assert.equal(typeof summary.gradeLabel, 'string');
});
