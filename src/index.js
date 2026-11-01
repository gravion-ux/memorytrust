'use strict';
// Public API of MemoryTrust: load memories, scan them, score them and report.

const { loadRecords, loadRecordsDetailed } = require('./loader.js');
const { scanRecord, scanRecords, locate } = require('./scanner.js');
const { RULES, ruleCatalogue, getRule } = require('./rules.js');
const {
  summarize,
  computeScore,
  gradeForScore,
  gradeLabel,
  sortFindings,
  createFinding,
  severityRank,
  compareSeverity,
  compareFindings,
  SEVERITIES,
  SEVERITY_WEIGHTS
} = require('./findings.js');
const { toJson, toMarkdown } = require('./report.js');
const { redact, maskValue, isPlaceholder } = require('./redact.js');
const { normaliseRecord, validateRecord, REQUIRED_FIELDS, KINDS } = require('./schema.js');

function createAuditor(targetPath, options = {}) {
  const detailed = loadRecordsDetailed(targetPath, options);
  const findings = scanRecords(detailed.records, options);
  const summary = summarize(findings);
  return { records: detailed.records, findings, summary };
}

module.exports = {
  loadRecords,
  loadRecordsDetailed,
  scanRecord,
  scanRecords,
  locate,
  RULES,
  ruleCatalogue,
  getRule,
  summarize,
  computeScore,
  gradeForScore,
  gradeLabel,
  sortFindings,
  createFinding,
  severityRank,
  compareSeverity,
  compareFindings,
  SEVERITIES,
  SEVERITY_WEIGHTS,
  toJson,
  toMarkdown,
  redact,
  maskValue,
  isPlaceholder,
  normaliseRecord,
  validateRecord,
  REQUIRED_FIELDS,
  KINDS,
  createAuditor
};
