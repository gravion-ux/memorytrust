'use strict';
// Tests for discovering and parsing memory files.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  MAX_FILE_BYTES,
  SKIP_DIRS,
  loadRecords,
  loadRecordsDetailed,
  parseFrontmatter,
  parseRecordsFromMarkdown,
  parseRecordsFromJson,
  parseRecordsFromJsonl
} = require('../src/loader.js');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'memorytrust-loader-'));
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

test('loader exposes the documented limits', () => {
  assert.equal(MAX_FILE_BYTES, 512 * 1024);
  for (const name of ['node_modules', '.git', 'dist', 'build', 'vendor']) {
    assert.ok(SKIP_DIRS.includes(name));
  }
});

test('parseFrontmatter reads YAML-ish frontmatter', () => {
  const result = parseFrontmatter('---\nid: user-1\nkind: fact\ntags: [ui, theme]\n---\nBody text.\n');
  assert.equal(result.present, true);
  assert.equal(result.data.id, 'user-1');
  assert.equal(result.data.kind, 'fact');
  assert.deepEqual(result.data.tags, ['ui', 'theme']);
  assert.ok(result.raw.includes('id: user-1'));
  assert.equal(result.line, 1);
});

test('parseFrontmatter reports absent frontmatter', () => {
  const result = parseFrontmatter('Just a body.\n');
  assert.equal(result.present, false);
  assert.deepEqual(result.data, {});
  assert.equal(result.raw, '');
});

test('parseRecordsFromMarkdown turns paragraphs into records with line numbers', () => {
  const text = '---\nkind: fact\n---\n\nFirst paragraph.\n\nSecond paragraph.\n';
  const records = parseRecordsFromMarkdown(text, 'memories/user.md');
  assert.equal(records.length, 2);
  assert.equal(records[0].content, 'First paragraph.');
  assert.equal(records[0].line, 5);
  assert.equal(records[1].content, 'Second paragraph.');
  assert.equal(records[1].line, 7);
  assert.equal(records[0].kind, 'fact');
  assert.equal(records[0].path, 'memories/user.md');
});

test('parseRecordsFromMarkdown returns zero records for frontmatter only files', () => {
  const records = parseRecordsFromMarkdown('---\nid: user-1\n---\n', 'memories/user.md');
  assert.deepEqual(records, []);
});

test('parseRecordsFromJson reads an object or an array of objects', () => {
  const single = parseRecordsFromJson('{"id":"a","content":"b"}', 'memories/one.json');
  assert.equal(single.records.length, 1);
  assert.equal(single.malformed, 0);
  const many = parseRecordsFromJson('[{"id":"a","content":"b"},{"id":"c","content":"d"}]', 'memories/many.json');
  assert.equal(many.records.length, 2);
  assert.equal(many.records[1].id, 'c');
});

test('parseRecordsFromJson counts malformed content', () => {
  const result = parseRecordsFromJson('{not json', 'memories/broken.json');
  assert.equal(result.records.length, 0);
  assert.equal(result.malformed, 1);
});

test('parseRecordsFromJsonl skips malformed lines and counts them', () => {
  const text = '{"id":"a","content":"b"}\nnot json\n{"id":"c","content":"d"}\n';
  const result = parseRecordsFromJsonl(text, 'memories/log.jsonl');
  assert.equal(result.records.length, 2);
  assert.equal(result.malformed, 1);
  assert.equal(result.records[1].line, 3);
});

test('loadRecords reads a directory and sorts by path then line', () => {
  const dir = makeTempDir();
  try {
    fs.mkdirSync(path.join(dir, 'memories'));
    fs.writeFileSync(path.join(dir, 'memories', 'b.md'), '---\n---\n\nB one.\n\nB two.\n', 'utf8');
    fs.writeFileSync(path.join(dir, 'memories', 'a.md'), '---\n---\n\nA one.\n', 'utf8');
    const records = loadRecords(dir);
    assert.equal(records.length, 3);
    assert.deepEqual(records.map((record) => `${record.path}:${record.line}`), [
      'memories/a.md:4',
      'memories/b.md:4',
      'memories/b.md:6'
    ]);
  } finally {
    cleanup(dir);
  }
});

test('loadRecordsDetailed reports loader statistics', () => {
  const dir = makeTempDir();
  try {
    fs.writeFileSync(path.join(dir, 'one.md'), '---\n---\n\nHello.\n', 'utf8');
    fs.writeFileSync(path.join(dir, 'two.jsonl'), '{"id":"a","content":"b"}\nbroken\n', 'utf8');
    const { records, stats } = loadRecordsDetailed(dir);
    assert.equal(records.length, 2);
    assert.equal(stats.filesRead, 2);
    assert.equal(stats.recordsLoaded, 2);
    assert.equal(stats.malformedLines, 1);
    assert.equal(stats.skippedFiles, 0);
    assert.equal(stats.target, path.resolve(dir));
  } finally {
    cleanup(dir);
  }
});

test('loadRecords skips ignored directories', () => {
  const dir = makeTempDir();
  try {
    fs.mkdirSync(path.join(dir, 'node_modules'));
    fs.mkdirSync(path.join(dir, '.git'));
    fs.writeFileSync(path.join(dir, 'node_modules', 'skip.md'), '---\n---\n\nSkipped.\n', 'utf8');
    fs.writeFileSync(path.join(dir, '.git', 'skip.md'), '---\n---\n\nSkipped.\n', 'utf8');
    fs.writeFileSync(path.join(dir, 'keep.md'), '---\n---\n\nKept.\n', 'utf8');
    const records = loadRecords(dir);
    assert.equal(records.length, 1);
    assert.equal(records[0].path, 'keep.md');
  } finally {
    cleanup(dir);
  }
});

test('loadRecords enforces the size cap', () => {
  const dir = makeTempDir();
  try {
    fs.writeFileSync(path.join(dir, 'big.md'), `x${'y'.repeat(5000)}`, 'utf8');
    const { records, stats } = loadRecordsDetailed(dir, { maxFileSize: 100 });
    assert.equal(records.length, 0);
    assert.equal(stats.skippedFiles, 1);
    assert.equal(stats.filesRead, 0);
  } finally {
    cleanup(dir);
  }
});

test('loadRecords enforces the file count cap', () => {
  const dir = makeTempDir();
  try {
    fs.writeFileSync(path.join(dir, 'a.md'), '---\n---\n\nA.\n', 'utf8');
    fs.writeFileSync(path.join(dir, 'b.md'), '---\n---\n\nB.\n', 'utf8');
    const { records, stats } = loadRecordsDetailed(dir, { maxFiles: 1 });
    assert.equal(records.length, 1);
    assert.equal(stats.skippedFiles, 1);
  } finally {
    cleanup(dir);
  }
});

test('loadRecords throws TARGET_NOT_FOUND for a missing target', () => {
  assert.throws(
    () => loadRecords(path.join(os.tmpdir(), 'memorytrust-does-not-exist-12345')),
    (error) => error.code === 'TARGET_NOT_FOUND'
  );
});

test('loadRecords throws ENOTDIR when the target is a file', () => {
  const dir = makeTempDir();
  try {
    const file = path.join(dir, 'single.md');
    fs.writeFileSync(file, '---\n---\n\nHello.\n', 'utf8');
    assert.throws(() => loadRecords(file), (error) => error.code === 'ENOTDIR');
  } finally {
    cleanup(dir);
  }
});
