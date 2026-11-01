'use strict';
// The memory record contract: field list, normalisation and required-field checks.

const REQUIRED_FIELDS = ['id', 'content'];
const KINDS = ['preference', 'fact', 'instruction', 'observation', 'unknown'];

// Kept off the enumerable shape so a normalised record still matches the documented
// contract while the scanner can tell that a required field was absent in the source.
const MISSING_FIELDS = Symbol.for('memorytrust.missingFields');

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function toIsoDate(value) {
  const text = toText(value);
  if (!text) return null;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return text;
}

function toBoolean(value, fallback) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
    return fallback;
  }
  const text = toText(value).toLowerCase();
  if (['true', 'yes', 'y', '1', 'on'].includes(text)) return true;
  if (['false', 'no', 'n', '0', 'off'].includes(text)) return false;
  return fallback;
}

function toConfidence(value) {
  if (value === null || value === undefined || value === '') return 1;
  const num = typeof value === 'number' ? value : Number(toText(value));
  if (!Number.isFinite(num)) return 1;
  if (num < 0) return 0;
  if (num > 1) return 1;
  return num;
}

function toTags(value) {
  if (Array.isArray(value)) return value.map((entry) => toText(entry)).filter(Boolean);
  const text = toText(value);
  if (!text) return [];
  return text.split(',').map((entry) => entry.trim()).filter(Boolean);
}

function toKind(value) {
  const text = toText(value).toLowerCase();
  return KINDS.includes(text) ? text : 'unknown';
}

function toLine(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 1) return 1;
  return Math.floor(num);
}

function pick(source, names) {
  for (const name of names) {
    if (source.has(name)) {
      const value = source.get(name);
      if (value !== undefined && value !== null && value !== '') return value;
    }
  }
  return undefined;
}

function normaliseRecord(input, context = {}) {
  const raw = isObject(input) ? input : {};
  const ctx = isObject(context) ? context : {};
  const lookup = new Map();
  for (const [key, value] of Object.entries(raw)) lookup.set(String(key).toLowerCase(), value);

  const missing = new Set();

  let id = toText(raw.id);
  if (!id) {
    missing.add('id');
    const index = Number.isFinite(ctx.index) ? Math.max(1, Math.floor(ctx.index)) : 1;
    id = `record-${index}`;
  }

  let content = typeof raw.content === 'string' ? raw.content.trim() : toText(raw.content);
  if (!content) {
    missing.add('content');
    content = '';
  }

  const kind = toKind(pick(lookup, ['kind', 'type']));
  const source = toText(pick(lookup, ['source', 'origin'])) || null;
  const createdAt = toIsoDate(pick(lookup, ['createdat', 'created_at', 'created', 'date']));
  const expiresAt = toIsoDate(pick(lookup, ['expiresat', 'expires_at', 'expires', 'expiry', 'expiry_date']));
  const confidence = toConfidence(pick(lookup, ['confidence']));
  const tags = toTags(pick(lookup, ['tags', 'labels']));
  const sensitive = toBoolean(pick(lookup, ['sensitive']), false);
  const consent = toBoolean(pick(lookup, ['consent', 'consented']), false);
  const path = toText(ctx.path !== undefined ? ctx.path : raw.path);
  const line = toLine(ctx.line !== undefined ? ctx.line : raw.line);

  const record = {
    id,
    content,
    kind,
    source,
    createdAt,
    expiresAt,
    confidence,
    tags,
    sensitive,
    consent,
    path,
    line
  };

  Object.defineProperty(record, MISSING_FIELDS, {
    value: missing,
    enumerable: false,
    configurable: true,
    writable: true
  });

  return record;
}

function missingRequiredFields(record) {
  const rec = isObject(record) ? record : {};
  const tracked = rec[MISSING_FIELDS];
  const missing = [];
  for (const field of REQUIRED_FIELDS) {
    if (tracked instanceof Set && tracked.has(field)) {
      missing.push(field);
      continue;
    }
    const value = rec[field];
    if (typeof value !== 'string' || value.trim() === '') missing.push(field);
  }
  return missing;
}

function validateRecord(record) {
  const rec = isObject(record) ? record : {};
  const problems = [];
  const missing = missingRequiredFields(rec);
  for (const field of REQUIRED_FIELDS) {
    if (missing.includes(field)) {
      problems.push({ field, problem: 'is required and must be a non-empty string' });
    }
  }
  const kind = toText(rec.kind).toLowerCase();
  if (kind && !KINDS.includes(kind)) {
    problems.push({ field: 'kind', problem: `must be one of: ${KINDS.join(', ')}` });
  }
  if (rec.confidence !== undefined && rec.confidence !== null) {
    const confidence = Number(rec.confidence);
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      problems.push({ field: 'confidence', problem: 'must be a number between 0 and 1' });
    }
  }
  return problems;
}

module.exports = {
  REQUIRED_FIELDS,
  KINDS,
  MISSING_FIELDS,
  normaliseRecord,
  validateRecord,
  missingRequiredFields
};
