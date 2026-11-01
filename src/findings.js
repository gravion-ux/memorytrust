'use strict';
// Finding construction, severity ordering, trust score and grade calculation.

const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'];
const SEVERITY_WEIGHTS = { critical: 20, high: 10, medium: 4, low: 2, info: 0 };
const CATEGORIES = ['provenance', 'freshness', 'conflict', 'sensitivity', 'privacy', 'structure', 'injection'];

const GRADE_BANDS = [
  { grade: 'A+', min: 0, max: 9, label: 'Excellent trust' },
  { grade: 'A', min: 10, max: 19, label: 'Good trust' },
  { grade: 'B', min: 20, max: 34, label: 'Fair trust' },
  { grade: 'C', min: 35, max: 49, label: 'Needs work' },
  { grade: 'D', min: 50, max: 69, label: 'Poor trust' },
  { grade: 'F', min: 70, max: 100, label: 'Critical risk' }
];

// Rank 0 is the most severe; unknown severities sort last.
function severityRank(severity) {
  const index = SEVERITIES.indexOf(String(severity || '').toLowerCase());
  return index === -1 ? SEVERITIES.length : index;
}

function compareSeverity(a, b) {
  return severityRank(a) - severityRank(b);
}

function createFinding(input) {
  const source = input && typeof input === 'object' ? input : {};
  const line = Number(source.line);
  const recordId = typeof source.recordId === 'string' ? source.recordId.trim() : '';
  return {
    ruleId: typeof source.ruleId === 'string' && source.ruleId ? source.ruleId : 'unknown',
    category: typeof source.category === 'string' && source.category ? source.category : 'unknown',
    severity: typeof source.severity === 'string' && source.severity ? source.severity.toLowerCase() : 'info',
    recordId: recordId || 'unknown',
    path: typeof source.path === 'string' ? source.path : '',
    line: Number.isFinite(line) && line >= 1 ? Math.floor(line) : 1,
    excerpt: typeof source.excerpt === 'string' ? source.excerpt : '',
    message: typeof source.message === 'string' ? source.message : '',
    remediation: typeof source.remediation === 'string' ? source.remediation : ''
  };
}

function compareFindings(a, b) {
  const bySeverity = compareSeverity(a.severity, b.severity);
  if (bySeverity !== 0) return bySeverity;
  const byPath = String(a.path || '').localeCompare(String(b.path || ''));
  if (byPath !== 0) return byPath;
  const byLine = (Number(a.line) || 0) - (Number(b.line) || 0);
  if (byLine !== 0) return byLine;
  return String(a.ruleId || '').localeCompare(String(b.ruleId || ''));
}

function sortFindings(findings) {
  return (Array.isArray(findings) ? findings.slice() : []).sort(compareFindings);
}

function computeScore(findings) {
  const list = Array.isArray(findings) ? findings : [];
  let total = 0;
  for (const finding of list) {
    const weight = SEVERITY_WEIGHTS[String(finding.severity || '').toLowerCase()];
    total += Number.isFinite(weight) ? weight : 0;
  }
  return Math.min(100, total);
}

function gradeForScore(score) {
  const numeric = Number(score);
  const value = Number.isFinite(numeric) ? Math.max(0, Math.min(100, numeric)) : 0;
  const band = GRADE_BANDS.find((entry) => value >= entry.min && value <= entry.max);
  return band ? band.grade : 'F';
}

function gradeLabel(grade) {
  const band = GRADE_BANDS.find((entry) => entry.grade === String(grade || '').trim());
  return band ? band.label : 'Unrated';
}

function summarize(findings) {
  const list = Array.isArray(findings) ? findings : [];
  const bySeverity = {};
  for (const severity of SEVERITIES) bySeverity[severity] = 0;
  const byCategory = {};
  for (const category of CATEGORIES) byCategory[category] = 0;

  const records = new Set();
  for (const finding of list) {
    const severity = String(finding.severity || '').toLowerCase();
    if (severity in bySeverity) bySeverity[severity] += 1;
    const category = String(finding.category || '').toLowerCase();
    if (category in byCategory) byCategory[category] += 1;
    records.add(String(finding.recordId || 'unknown'));
  }

  const score = computeScore(list);
  const grade = gradeForScore(score);
  return {
    total: list.length,
    bySeverity,
    byCategory,
    affectedRecords: records.size,
    score,
    grade,
    gradeLabel: gradeLabel(grade)
  };
}

module.exports = {
  SEVERITIES,
  SEVERITY_WEIGHTS,
  CATEGORIES,
  GRADE_BANDS,
  severityRank,
  compareSeverity,
  createFinding,
  compareFindings,
  sortFindings,
  computeScore,
  gradeForScore,
  gradeLabel,
  summarize
};
