#!/usr/bin/env node
'use strict';
// Command line entry point: argument parsing, reporting and exit codes.

const fs = require('node:fs');
const path = require('node:path');
const process = require('node:process');

const { loadRecordsDetailed } = require('./loader.js');
const { scanRecords } = require('./scanner.js');
const { summarize, severityRank, SEVERITIES } = require('./findings.js');
const { toJson, toMarkdown } = require('./report.js');
const { ruleCatalogue } = require('./rules.js');

const USAGE = [
  'memory-trust audit <path> [--json <out.json>] [--md <out.md>] [--fail-on <severity>]',
  '             [--max-age <days>] [--now <iso-date>] [--quiet]',
  'memory-trust rules [--json]',
  '',
  'Exit codes: 0 clean, 1 findings at or above the threshold, 2 usage error, 3 target missing.'
].join('\n');

function usageError(message) {
  const error = new Error(message);
  error.usage = true;
  return error;
}

function parseArgs(argv) {
  const args = Array.isArray(argv) ? argv.slice() : [];
  if (!args.length) throw usageError('missing command (expected "audit" or "rules")');

  const command = args.shift();
  if (command !== 'audit' && command !== 'rules') throw usageError(`unknown command "${command}"`);

  const options = {
    command,
    target: null,
    jsonPath: null,
    mdPath: null,
    jsonStdout: false,
    failOn: 'high',
    maxAge: 180,
    now: null,
    quiet: false,
    help: false
  };

  while (args.length) {
    const arg = args.shift();
    if (arg === '--json' && command === 'rules') {
      options.jsonStdout = true;
      continue;
    }
    switch (arg) {
      case '--json': {
        const value = args.shift();
        if (!value || value.startsWith('--')) throw usageError('--json requires an output file path');
        options.jsonPath = value;
        break;
      }
      case '--md': {
        const value = args.shift();
        if (!value || value.startsWith('--')) throw usageError('--md requires an output file path');
        options.mdPath = value;
        break;
      }
      case '--fail-on': {
        const value = args.shift();
        if (!value) throw usageError('--fail-on requires a severity');
        if (!SEVERITIES.includes(value)) throw usageError(`invalid severity "${value}" (expected one of ${SEVERITIES.join(', ')})`);
        options.failOn = value;
        break;
      }
      case '--max-age': {
        const value = args.shift();
        const days = Number(value);
        if (value === undefined || !Number.isFinite(days) || days < 0) throw usageError('--max-age requires a non-negative number of days');
        options.maxAge = days;
        break;
      }
      case '--now': {
        const value = args.shift();
        if (!value || Number.isNaN(new Date(value).getTime())) throw usageError('--now requires a parseable ISO date');
        options.now = value;
        break;
      }
      case '--quiet':
        options.quiet = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default: {
        if (arg.startsWith('-')) throw usageError(`unknown option "${arg}"`);
        if (command === 'audit') {
          if (options.target) throw usageError('audit accepts exactly one target path');
          options.target = arg;
        } else {
          throw usageError(`unexpected argument "${arg}"`);
        }
      }
    }
  }

  if (command === 'audit' && !options.target && !options.help) throw usageError('audit requires a target path');
  return options;
}

function humanSummary(findings, summary, stats) {
  const lines = [];
  lines.push(`memory-trust: ${summary.total} finding(s) across ${summary.affectedRecords} record(s) — trust score ${summary.score}/100 (${summary.grade}, ${summary.gradeLabel})`);
  lines.push(`memory-trust: scanned ${stats.filesRead} file(s), loaded ${stats.recordsLoaded} record(s)`);
  lines.push('');
  for (const finding of findings) {
    lines.push(`${finding.ruleId}  ${finding.severity}  ${finding.path}:${finding.line}  ${finding.message}`);
  }
  return `${lines.join('\n')}\n`;
}

function rulesText() {
  const lines = ['memory-trust rule catalogue', ''];
  for (const rule of ruleCatalogue()) {
    lines.push(`${rule.id}  [${rule.severity}]  ${rule.category}`);
    lines.push(`  ${rule.description}`);
    lines.push(`  remediation: ${rule.remediation}`);
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

function writeOutput(filePath, contents) {
  const resolved = path.resolve(filePath);
  const dir = path.dirname(resolved);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(resolved, contents, 'utf8');
}

function run(argv, io = {}) {
  const stdout = typeof io.stdout === 'function' ? io.stdout : (text) => process.stdout.write(text);
  const stderr = typeof io.stderr === 'function' ? io.stderr : (text) => process.stderr.write(text);

  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    stderr(`memory-trust: error: ${error.message}\n`);
    stderr(`${USAGE}\n`);
    return 2;
  }

  if (options.help) {
    stdout(`${USAGE}\n`);
    return 0;
  }

  if (options.command === 'rules') {
    stdout(options.jsonStdout ? `${JSON.stringify(ruleCatalogue(), null, 2)}\n` : rulesText());
    return 0;
  }

  let detailed;
  try {
    detailed = loadRecordsDetailed(options.target);
  } catch (error) {
    stderr(`memory-trust: error: ${error.message}\n`);
    return 3;
  }

  const findings = scanRecords(detailed.records, {
    maxAgeDays: options.maxAge,
    now: options.now ? new Date(options.now) : undefined
  });
  const summary = summarize(findings);
  const meta = {
    target: detailed.stats.target,
    generatedAt: new Date().toISOString()
  };

  try {
    if (options.jsonPath) writeOutput(options.jsonPath, toJson(findings, summary, meta));
    if (options.mdPath) writeOutput(options.mdPath, toMarkdown(findings, summary, meta));
  } catch (error) {
    stderr(`memory-trust: error: could not write report: ${error.message}\n`);
    return 2;
  }

  if (!options.quiet) stdout(humanSummary(findings, summary, detailed.stats));

  const threshold = severityRank(options.failOn);
  const breached = findings.some((finding) => severityRank(finding.severity) <= threshold);
  return breached ? 1 : 0;
}

function main(argv) {
  const code = run(argv);
  process.exitCode = code;
  return code;
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { parseArgs, run, main, USAGE };
