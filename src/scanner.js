'use strict';
// Apply the rule catalogue to loaded records and turn matches into findings.

const { RULES } = require('./rules.js');
const { createFinding, sortFindings } = require('./findings.js');
const { redact } = require('./redact.js');

const EXCERPT_LIMIT = 240;

function toMatchList(result) {
  if (!result) return [];
  if (Array.isArray(result)) return result.filter((entry) => entry && typeof entry === 'object');
  if (typeof result === 'object') return [result];
  if (typeof result === 'string') return [{ message: result }];
  return [];
}

function locate(text, index) {
  const source = typeof text === 'string' ? text : '';
  const rawIndex = Number(index);
  const position = Number.isFinite(rawIndex) && rawIndex > 0 ? Math.min(Math.floor(rawIndex), source.length) : 0;
  const before = source.slice(0, position);
  const line = before.split('\n').length;
  const lastNewline = before.lastIndexOf('\n');
  const column = position - lastNewline;
  const lineStart = lastNewline + 1;
  const lineEnd = source.indexOf('\n', position);
  const rawLine = source.slice(lineStart, lineEnd === -1 ? source.length : lineEnd);
  let excerpt = rawLine.trim();
  if (excerpt.length > EXCERPT_LIMIT) excerpt = `${excerpt.slice(0, EXCERPT_LIMIT - 1)}…`;
  return { line, column, excerpt };
}

function scanRecord(record, context = {}) {
  const ctx = context && typeof context === 'object' ? context : {};
  const target = record && typeof record === 'object' ? record : {};
  const text = typeof target.content === 'string' ? target.content : '';
  const findings = [];

  for (const rule of RULES) {
    if (rule.category === 'conflict') continue;
    let result = null;
    try {
      result = rule.test(text, { ...ctx, record: target });
    } catch {
      result = null;
    }
    for (const match of toMatchList(result)) {
      const hasPosition = typeof match.index === 'number' && match.index >= 0;
      const located = locate(text, hasPosition ? match.index : 0);
      findings.push(createFinding({
        ruleId: rule.id,
        category: rule.category,
        severity: rule.severity,
        recordId: target.id,
        path: target.path,
        line: (Number(target.line) || 1) + (hasPosition ? Math.max(0, located.line - 1) : 0),
        excerpt: redact(match.excerpt !== undefined ? match.excerpt : (hasPosition ? located.excerpt : text)),
        message: match.message || rule.description,
        remediation: rule.remediation
      }));
    }
  }

  return sortFindings(findings);
}

function scanRecords(records, options = {}) {
  const opts = options && typeof options === 'object' ? options : {};
  const list = Array.isArray(records) ? records : [];
  const now = opts.now instanceof Date ? opts.now : (opts.now ? new Date(opts.now) : new Date());
  const maxAgeDays = Number.isFinite(opts.maxAgeDays) ? opts.maxAgeDays : 180;

  const findings = [];
  for (const record of list) {
    findings.push(...scanRecord(record, { records: list, now, maxAgeDays }));
  }

  // Conflict rules need the whole record set, so they run once over the full set.
  for (const rule of RULES) {
    if (rule.category !== 'conflict') continue;
    for (const record of list) {
      const text = typeof record.content === 'string' ? record.content : '';
      let result = null;
      try {
        result = rule.test(text, { record, records: list, now, maxAgeDays });
      } catch {
        result = null;
      }
      for (const match of toMatchList(result)) {
        findings.push(createFinding({
          ruleId: rule.id,
          category: rule.category,
          severity: rule.severity,
          recordId: record.id,
          path: record.path,
          line: Number(record.line) || 1,
          excerpt: redact(match.excerpt !== undefined ? match.excerpt : text),
          message: match.message || rule.description,
          remediation: rule.remediation
        }));
      }
    }
  }

  return sortFindings(findings);
}

module.exports = {
  scanRecord,
  scanRecords,
  locate
};
