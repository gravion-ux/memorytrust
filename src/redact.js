'use strict';
// Redaction helpers so secret-looking evidence can be shown without disclosing it.

const PLACEHOLDER_VALUES = new Set([
  'your_api_key_here',
  'your-token-here',
  'your_token_here',
  'yourapikey',
  'xxx',
  'xxxxxx',
  'xxxxxxxx',
  '<your-token>',
  '<token>',
  '<api-key>',
  'changeme',
  'change_me',
  'example.com',
  'replace_me',
  'todo',
  'none',
  'null',
  'n/a'
]);

function isPlaceholder(value) {
  if (value === null || value === undefined) return true;
  const raw = String(value).trim();
  if (!raw) return true;
  const lower = raw.toLowerCase();
  if (PLACEHOLDER_VALUES.has(lower)) return true;
  if (/^x{3,}$/.test(lower)) return true;
  if (/^<[^>]+>$/.test(lower)) return true;
  if (/^(your|my|insert|replace)[_\- ]/.test(lower)) return true;
  if (lower.endsWith('_here') || lower.endsWith('-here')) return true;
  if (lower.includes('example.com')) return true;
  return false;
}

function maskValue(value) {
  if (value === null || value === undefined) return '';
  const raw = String(value);
  if (!raw) return '';
  if (raw.length < 8) return '…';
  return `${raw.slice(0, 4)}…${raw.slice(-4)}`;
}

function looksSecret(value) {
  const raw = String(value || '').trim();
  if (!raw) return false;
  if (raw.length >= 8) return true;
  return raw.length >= 6 && /[0-9]/.test(raw) && /[A-Za-z]/.test(raw);
}

function redact(text) {
  if (text === null || text === undefined) return '';
  const raw = String(text);
  if (!raw) return '';

  let out = raw;

  out = out.replace(
    /-----BEGIN ([A-Z0-9 ]*PRIVATE KEY)-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g,
    (match, label) => `-----BEGIN ${label}----- [REDACTED PRIVATE KEY] -----END ${label}-----`
  );

  out = out.replace(/\bAKIA[0-9A-Z]{16}\b/g, (match) => maskValue(match));
  out = out.replace(/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{16,}\b/g, (match) => `${match.slice(0, 4)}…${match.slice(-4)}`);
  out = out.replace(/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, (match) => `${match.slice(0, 10)}…${match.slice(-4)}`);
  out = out.replace(/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, (match) => maskValue(match));
  out = out.replace(/\bsk-[A-Za-z0-9_-]{16,}\b/g, (match) => maskValue(match));

  out = out.replace(
    /\b(password|passwd|pwd|api[_-]?key|secret|client[_-]?secret|access[_-]?token|auth[_-]?token|token)\b(\s*[:=]\s*)(["']?)([^\s"',;]+)/gi,
    (match, key, separator, quote, value) => {
      if (isPlaceholder(value)) return match;
      if (!looksSecret(value)) return match;
      // The opening quote is part of the match, the closing quote is not: keep it untouched.
      return `${key}${separator}${quote}${maskValue(value)}`;
    }
  );

  return out;
}

module.exports = {
  redact,
  maskValue,
  isPlaceholder,
  looksSecret
};
