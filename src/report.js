'use strict';
// Render the audit result as stable JSON or as a human-readable Markdown report.

const { redact } = require('./redact.js');
const { sortFindings, SEVERITIES, CATEGORIES } = require('./findings.js');

const TOOL_NAME = 'memorytrust';
const SCHEMA_VERSION = '1.0';

function escapeCell(value) {
  return String(value === undefined || value === null ? '' : value)
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ');
}

function serialiseFinding(finding) {
  return {
    ruleId: finding.ruleId,
    category: finding.category,
    severity: finding.severity,
    recordId: finding.recordId,
    path: finding.path,
    line: finding.line,
    excerpt: redact(finding.excerpt),
    message: finding.message,
    remediation: finding.remediation
  };
}

function toJson(findings, summary, meta = {}) {
  const list = sortFindings(findings);
  const details = meta && typeof meta === 'object' ? meta : {};
  const payload = {
    tool: TOOL_NAME,
    schemaVersion: SCHEMA_VERSION,
    target: details.target !== undefined ? details.target : '',
    generatedAt: details.generatedAt !== undefined ? details.generatedAt : new Date().toISOString(),
    summary: summary && typeof summary === 'object' ? summary : {},
    findings: list.map(serialiseFinding)
  };
  return JSON.stringify(payload, null, 2);
}

function toMarkdown(findings, summary, meta = {}) {
  const list = sortFindings(findings).map(serialiseFinding);
  const details = meta && typeof meta === 'object' ? meta : {};
  const totals = summary && typeof summary === 'object' ? summary : {};
  const bySeverity = totals.bySeverity && typeof totals.bySeverity === 'object' ? totals.bySeverity : {};
  const byCategory = totals.byCategory && typeof totals.byCategory === 'object' ? totals.byCategory : {};
  const target = details.target !== undefined ? details.target : '';
  const generatedAt = details.generatedAt !== undefined ? details.generatedAt : new Date().toISOString();

  const lines = [];
  lines.push('# Memory Trust Audit Report');
  lines.push('');
  lines.push(`- Target: \`${target}\``);
  lines.push(`- Generated: ${generatedAt}`);
  lines.push(`- Trust score: ${totals.score !== undefined ? totals.score : 0}/100 (grade ${totals.grade || '-'}, ${totals.gradeLabel || 'Unrated'})`);
  lines.push(`- Records affected: ${totals.affectedRecords !== undefined ? totals.affectedRecords : 0}`);
  lines.push('');
  lines.push('## Severity summary');
  lines.push('');
  lines.push('| Severity | Count |');
  lines.push('| --- | --- |');
  for (const severity of SEVERITIES) {
    lines.push(`| ${severity} | ${bySeverity[severity] || 0} |`);
  }
  lines.push('');
  lines.push('## Findings');
  lines.push('');
  if (!list.length) {
    lines.push('No findings.');
    lines.push('');
  } else {
    lines.push('| Severity | Rule | Record | Location | Message |');
    lines.push('| --- | --- | --- | --- | --- |');
    for (const finding of list) {
      lines.push(`| ${escapeCell(finding.severity)} | ${escapeCell(finding.ruleId)} | ${escapeCell(finding.recordId)} | ${escapeCell(`${finding.path}:${finding.line}`)} | ${escapeCell(finding.message)} |`);
    }
    lines.push('');
  }

  lines.push('## Category breakdown');
  lines.push('');
  lines.push('| Category | critical | high | medium | low | info | Count |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const category of CATEGORIES) {
    const counts = SEVERITIES.map((severity) => list.filter((finding) => finding.category === category && finding.severity === severity).length);
    const total = counts.reduce((sum, value) => sum + value, 0);
    lines.push(`| ${escapeCell(category)} | ${counts.join(' | ')} | ${total} |`);
  }
  lines.push('');
  lines.push('## Remediation');
  lines.push('');

  if (!list.length) {
    lines.push('Nothing to remediate.');
    lines.push('');
    return lines.join('\n');
  }

  const seen = new Set();
  for (const finding of list) {
    if (seen.has(finding.ruleId)) continue;
    seen.add(finding.ruleId);
    lines.push(`### ${finding.ruleId} — ${finding.severity}`);
    lines.push('');
    lines.push(finding.remediation);
    lines.push('');
    const evidence = list.filter((entry) => entry.ruleId === finding.ruleId);
    if (evidence.some((entry) => entry.excerpt)) {
      lines.push('Evidence (redacted):');
      lines.push('');
      for (const entry of evidence) {
        const excerpt = entry.excerpt ? ` — ${entry.excerpt}` : '';
        lines.push(`- \`${entry.path}:${entry.line}\`${excerpt}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

module.exports = {
  TOOL_NAME,
  SCHEMA_VERSION,
  toJson,
  toMarkdown
};
