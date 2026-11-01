'use strict';
// Tests for the CLI: argument parsing, exit codes and report file outputs.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { parseArgs } = require('../src/cli.js');
const { RULES } = require('../src/rules.js');

const CLI_PATH = path.join(__dirname, '..', 'src', 'cli.js');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'memorytrust-cli-'));
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function runCli(args, options = {}) {
  return spawnSync(process.execPath, [CLI_PATH, ...args], { encoding: 'utf8', ...options });
}

test('parseArgs reads an audit command with defaults', () => {
  const options = parseArgs(['audit', 'memories']);
  assert.equal(options.command, 'audit');
  assert.equal(options.target, 'memories');
  assert.equal(options.failOn, 'high');
  assert.equal(options.maxAge, 180);
  assert.equal(options.quiet, false);
});

test('parseArgs reads every audit option', () => {
  const options = parseArgs([
    'audit', 'memories', '--json', 'out.json', '--md', 'out.md',
    '--fail-on', 'medium', '--max-age', '30', '--now', '2026-10-12', '--quiet'
  ]);
  assert.equal(options.jsonPath, 'out.json');
  assert.equal(options.mdPath, 'out.md');
  assert.equal(options.failOn, 'medium');
  assert.equal(options.maxAge, 30);
  assert.equal(options.now, '2026-10-12');
  assert.equal(options.quiet, true);
});

test('parseArgs rejects unknown commands, missing paths and bad options', () => {
  assert.throws(() => parseArgs(['nope']), /unknown command/);
  assert.throws(() => parseArgs(['audit']), /requires a target path/);
  assert.throws(() => parseArgs(['audit', 'x', '--fail-on', 'urgent']), /invalid severity/);
  assert.throws(() => parseArgs(['audit', 'x', '--max-age', 'soon']), /non-negative number/);
  assert.throws(() => parseArgs(['audit', 'x', '--json']), /requires an output file path/);
});

test('the CLI exits 0 and prints a summary for a clean memory store', () => {
  const dir = makeTempDir();
  try {
    fs.writeFileSync(path.join(dir, 'clean.md'), [
      '---',
      'id: user-dark-mode',
      'kind: preference',
      'source: conversation:2026-10-12',
      '---',
      '',
      'The user prefers the dark theme.'
    ].join('\n'), 'utf8');
    const result = runCli(['audit', dir]);
    assert.equal(result.status, 0);
    assert.ok(result.stdout.includes('finding(s)'));
    assert.ok(!result.stderr.includes('error'));
  } finally {
    cleanup(dir);
  }
});

test('the CLI exits 1 and lists the rule id when a finding is at or above the threshold', () => {
  const dir = makeTempDir();
  try {
    fs.writeFileSync(path.join(dir, 'dirty.md'), [
      '---',
      'id: user-key',
      'source: conversation:2026-10-12',
      '---',
      '',
      'The key is AKIAIOSFODNN7EXAMPLE.'
    ].join('\n'), 'utf8');
    const result = runCli(['audit', dir]);
    assert.equal(result.status, 1);
    assert.ok(result.stdout.includes('finding(s)'));
    assert.ok(result.stdout.includes('MT-SENS-001'));
    assert.ok(!result.stdout.includes('AKIAIOSFODNN7EXAMPLE'));
  } finally {
    cleanup(dir);
  }
});

test('the CLI honours --quiet and --fail-on', () => {
  const dir = makeTempDir();
  try {
    fs.writeFileSync(path.join(dir, 'dirty.md'), [
      '---',
      'id: user-key',
      'source: conversation:2026-10-12',
      '---',
      '',
      'The key is AKIAIOSFODNN7EXAMPLE.'
    ].join('\n'), 'utf8');
    const quiet = runCli(['audit', dir, '--quiet']);
    assert.equal(quiet.status, 1);
    assert.equal(quiet.stdout.trim(), '');
    const below = runCli(['audit', dir, '--fail-on', 'critical', '--quiet']);
    assert.equal(below.status, 1);
  } finally {
    cleanup(dir);
  }
});

test('the CLI writes JSON and Markdown reports', () => {
  const dir = makeTempDir();
  try {
    fs.writeFileSync(path.join(dir, 'dirty.md'), [
      '---',
      'id: user-key',
      'source: conversation:2026-10-12',
      '---',
      '',
      'The key is AKIAIOSFODNN7EXAMPLE.'
    ].join('\n'), 'utf8');
    const jsonPath = path.join(dir, 'report.json');
    const mdPath = path.join(dir, 'report.md');
    const result = runCli(['audit', dir, '--json', jsonPath, '--md', mdPath]);
    assert.equal(result.status, 1);
    assert.ok(fs.existsSync(jsonPath));
    assert.ok(fs.existsSync(mdPath));
    const payload = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    assert.equal(payload.tool, 'memorytrust');
    assert.ok(payload.findings.some((finding) => finding.ruleId === 'MT-SENS-001'));
    const markdown = fs.readFileSync(mdPath, 'utf8');
    assert.ok(markdown.includes('# Memory Trust Audit Report'));
    assert.ok(markdown.includes('MT-SENS-001'));
    assert.ok(markdown.includes('AKIA…MPLE'));
  } finally {
    cleanup(dir);
  }
});

test('the CLI exits 3 when the target is missing', () => {
  const result = runCli(['audit', path.join(os.tmpdir(), 'memorytrust-missing-dir-98765')]);
  assert.equal(result.status, 3);
  assert.ok(result.stderr.startsWith('memory-trust: error: '));
});

test('the CLI exits 2 on a usage error', () => {
  const result = runCli(['nope']);
  assert.equal(result.status, 2);
  assert.ok(result.stderr.startsWith('memory-trust: error: '));
});

test('the rules command prints every rule id', () => {
  const result = runCli(['rules']);
  assert.equal(result.status, 0);
  for (const rule of RULES) assert.ok(result.stdout.includes(rule.id));
});

test('the rules command prints JSON on request', () => {
  const result = runCli(['rules', '--json']);
  assert.equal(result.status, 0);
  const parsed = JSON.parse(result.stdout);
  assert.ok(Array.isArray(parsed));
  assert.equal(parsed.length, RULES.length);
  assert.ok(parsed.every((rule) => typeof rule.id === 'string' && typeof rule.severity === 'string'));
});
