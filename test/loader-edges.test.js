'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const loader = require('../src/loader.js');

test('frontmatter keeps the first value for a duplicate key', () => {
  const parsed = loader.parseFrontmatter('---\nkind: note\nkind: override\n---\nbody');
  assert.equal(parsed.data.kind, 'note');
});
