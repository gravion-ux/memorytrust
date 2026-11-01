'use strict';
// Tests for the memory record shape, normalisation and validation.

const test = require('node:test');
const assert = require('node:assert/strict');
const { REQUIRED_FIELDS, KINDS, normaliseRecord, validateRecord } = require('../src/schema.js');

test('REQUIRED_FIELDS lists id and content', () => {
  assert.deepEqual(REQUIRED_FIELDS, ['id', 'content']);
});

test('KINDS lists the five allowed record kinds', () => {
  assert.deepEqual(KINDS, ['preference', 'fact', 'instruction', 'observation', 'unknown']);
});

test('normaliseRecord fills every documented default', () => {
  const record = normaliseRecord({});
  assert.equal(record.content, '');
  assert.equal(record.kind, 'unknown');
  assert.equal(record.source, null);
  assert.equal(record.createdAt, null);
  assert.equal(record.expiresAt, null);
  assert.equal(record.confidence, 1);
  assert.deepEqual(record.tags, []);
  assert.equal(record.sensitive, false);
  assert.equal(record.consent, false);
  assert.equal(record.path, '');
  assert.equal(record.line, 1);
});

test('normaliseRecord generates a record-<n> id when id is missing', () => {
  assert.equal(normaliseRecord({ content: 'x' }).id, 'record-1');
  assert.equal(normaliseRecord({ content: 'x' }, { index: 4 }).id, 'record-4');
});

test('normaliseRecord produces exactly the documented keys', () => {
  const record = normaliseRecord({ id: 'a', content: 'b' });
  assert.deepEqual(Object.keys(record), [
    'id', 'content', 'kind', 'source', 'createdAt', 'expiresAt',
    'confidence', 'tags', 'sensitive', 'consent', 'path', 'line'
  ]);
});

test('normaliseRecord coerces scalar types', () => {
  const record = normaliseRecord({
    id: 'a',
    content: 'b',
    kind: 'FACT',
    confidence: '0.3',
    tags: 'ui, theme',
    sensitive: 'yes',
    consent: 1
  });
  assert.equal(record.kind, 'fact');
  assert.equal(record.confidence, 0.3);
  assert.deepEqual(record.tags, ['ui', 'theme']);
  assert.equal(record.sensitive, true);
  assert.equal(record.consent, true);
});

test('normaliseRecord clamps confidence into 0..1 and never throws', () => {
  assert.equal(normaliseRecord({ confidence: 5 }).confidence, 1);
  assert.equal(normaliseRecord({ confidence: -3 }).confidence, 0);
  assert.equal(normaliseRecord(null).id, 'record-1');
  assert.equal(normaliseRecord(undefined, null).content, '');
});

test('normaliseRecord keeps the record path and line from the context', () => {
  const record = normaliseRecord({ id: 'a', content: 'b' }, { path: 'memories/user.md', line: 7 });
  assert.equal(record.path, 'memories/user.md');
  assert.equal(record.line, 7);
});

test('validateRecord accepts a complete record', () => {
  const record = normaliseRecord({ id: 'a', content: 'b' });
  assert.deepEqual(validateRecord(record), []);
});

test('validateRecord reports missing required fields', () => {
  const problems = validateRecord(normaliseRecord({}));
  const fields = problems.map((problem) => problem.field);
  assert.ok(fields.includes('id'));
  assert.ok(fields.includes('content'));
  for (const problem of problems) assert.equal(typeof problem.problem, 'string');
});

test('validateRecord reports an invalid kind and confidence', () => {
  const problems = validateRecord({ id: 'a', content: 'b', kind: 'nonsense', confidence: 4 });
  const fields = problems.map((problem) => problem.field);
  assert.ok(fields.includes('kind'));
  assert.ok(fields.includes('confidence'));
});
