'use strict';
// Tests for secret redaction, masking and placeholder detection.

const test = require('node:test');
const assert = require('node:assert/strict');
const { redact, maskValue, isPlaceholder } = require('../src/redact.js');

test('redact returns an empty string for empty input', () => {
  assert.equal(redact(''), '');
  assert.equal(redact(null), '');
  assert.equal(redact(undefined), '');
});

test('maskValue keeps a prefix and suffix hint', () => {
  assert.equal(maskValue('abcdefghijklmnop'), 'abcd…mnop');
});

test('maskValue masks short values completely', () => {
  assert.equal(maskValue('short'), '…');
  assert.equal(maskValue(''), '');
});

test('isPlaceholder recognises placeholder values', () => {
  assert.equal(isPlaceholder('your_api_key_here'), true);
  assert.equal(isPlaceholder('xxxxxx'), true);
  assert.equal(isPlaceholder('<token>'), true);
  assert.equal(isPlaceholder('changeme'), true);
  assert.equal(isPlaceholder('example.com'), true);
  assert.equal(isPlaceholder('REPLACE_ME'), true);
});

test('isPlaceholder rejects real looking values', () => {
  assert.equal(isPlaceholder('s3cretValue'), false);
  assert.equal(isPlaceholder('hunter2hunter2'), false);
});

test('redact masks a private key block', () => {
  const key = '-----BEGIN RSA PRIVATE KEY-----\nMIIEow\nIBAAKCAQEA\n-----END RSA PRIVATE KEY-----';
  const output = redact(key);
  assert.ok(output.includes('[REDACTED PRIVATE KEY]'));
  assert.ok(!output.includes('MIIEow'));
});

test('redact masks an AWS access key id', () => {
  assert.equal(redact('key AKIAIOSFODNN7EXAMPLE here'), 'key AKIA…MPLE here');
});

test('redact masks a GitHub token', () => {
  const token = 'ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  assert.ok(redact(`token ${token}`).includes('ghp_…aaaa'));
  assert.ok(!redact(`token ${token}`).includes('aaaaaaaaaaaaaaaaaaaa'));
});

test('redact masks a credential assignment value', () => {
  assert.equal(redact('password = "hunter2hunter2"'), 'password = "hunt…ter2"');
});

test('redact leaves placeholder credentials untouched', () => {
  assert.equal(redact('api_key = "your_api_key_here"'), 'api_key = "your_api_key_here"');
  assert.equal(redact('token: changeme'), 'token: changeme');
});

test('redact leaves ordinary prose untouched', () => {
  const prose = 'The user prefers dark mode and the project uses TypeScript.';
  assert.equal(redact(prose), prose);
});
