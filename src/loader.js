'use strict';
// Discover and load memory records from markdown, JSON and JSONL files.

const fs = require('node:fs');
const path = require('node:path');
const { normaliseRecord } = require('./schema.js');

const MAX_FILE_BYTES = 512 * 1024;
const SKIP_DIRS = ['node_modules', '.git', 'dist', 'build', 'vendor'];
const MEMORY_EXTENSIONS = ['.md', '.markdown', '.json', '.jsonl'];

const FRONTMATTER_RE = /^---[ \t]*\r?\n([\s\S]*?)^---[ \t]*(?:\r?\n|$)/m;

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stripQuotes(value) {
  const raw = String(value).trim();
  if (raw.length >= 2 && ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'")))) {
    return raw.slice(1, -1);
  }
  return raw;
}

function parseScalar(raw) {
  const value = String(raw).trim();
  if (!value) return '';
  if (value.startsWith('[') && value.endsWith(']')) {
    const inner = value.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(',').map((entry) => stripQuotes(entry)).filter((entry) => entry.length > 0);
  }
  if (/^(true|false)$/i.test(value)) return value.toLowerCase() === 'true';
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
  return stripQuotes(value);
}

function parseFrontmatterData(raw) {
  const data = {};
  const lines = String(raw).split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const match = /^([A-Za-z0-9_.-]+)\s*:\s*(.*)$/.exec(line);
    if (!match) continue;
    data[match[1]] = parseScalar(match[2]);
  }
  return data;
}

function parseFrontmatter(text) {
  const source = typeof text === 'string' ? text.replace(/^\uFEFF/, '') : '';
  const match = FRONTMATTER_RE.exec(source);
  if (!match) return { present: false, data: {}, raw: '', line: 0 };
  const raw = match[1] === undefined ? '' : match[1];
  return { present: true, data: parseFrontmatterData(raw), raw, line: 1 };
}

function frontmatterBody(source) {
  const match = FRONTMATTER_RE.exec(source);
  if (!match) return { body: source, offset: 0, present: false };
  return { body: source.slice(match[0].length), offset: match[0].length, present: true };
}

function splitParagraphs(body, linesBefore) {
  const paragraphs = [];
  const lines = body.split(/\r?\n/);
  let current = [];
  let startLine = 0;

  lines.forEach((line, index) => {
    const lineNumber = linesBefore + index + 1;
    if (!line.trim()) {
      if (current.length) {
        paragraphs.push({ text: current.join('\n'), line: startLine });
        current = [];
      }
      return;
    }
    if (!current.length) startLine = lineNumber;
    current.push(line.trim());
  });

  if (current.length) paragraphs.push({ text: current.join('\n'), line: startLine });
  return paragraphs;
}

function parseRecordsFromMarkdown(text, relativePath) {
  const source = typeof text === 'string' ? text.replace(/^\uFEFF/, '') : '';
  const frontmatter = parseFrontmatter(source);
  const { body, offset } = frontmatterBody(source);
  const linesBefore = offset === 0 ? 0 : source.slice(0, offset).split(/\r?\n/).length - 1;
  const paragraphs = splitParagraphs(body, linesBefore);

  const records = [];
  paragraphs.forEach((paragraph, index) => {
    const merged = { ...frontmatter.data };
    merged.content = paragraph.text;
    records.push(normaliseRecord(merged, { path: relativePath, line: paragraph.line, index: index + 1 }));
  });
  return records;
}

function parseRecordsFromJson(text, relativePath) {
  const source = typeof text === 'string' ? text : '';
  let parsed;
  try {
    parsed = JSON.parse(source);
  } catch {
    return { records: [], malformed: 1 };
  }
  const entries = Array.isArray(parsed) ? parsed : [parsed];
  const records = [];
  let malformed = 0;
  entries.forEach((entry, index) => {
    if (!isObject(entry)) {
      malformed += 1;
      return;
    }
    records.push(normaliseRecord(entry, { path: relativePath, line: index + 1, index: index + 1 }));
  });
  return { records, malformed };
}

function parseRecordsFromJsonl(text, relativePath) {
  const source = typeof text === 'string' ? text : '';
  const records = [];
  let malformed = 0;
  source.split(/\r?\n/).forEach((line, index) => {
    if (!line.trim()) return;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      malformed += 1;
      return;
    }
    if (!isObject(entry)) {
      malformed += 1;
      return;
    }
    records.push(normaliseRecord(entry, { path: relativePath, line: index + 1, index: records.length + 1 }));
  });
  return { records, malformed };
}

function collectFiles(root) {
  const files = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.includes(entry.name)) continue;
        walk(path.join(dir, entry.name));
        continue;
      }
      if (!entry.isFile()) continue;
      if (!MEMORY_EXTENSIONS.includes(path.extname(entry.name).toLowerCase())) continue;
      files.push(path.join(dir, entry.name));
    }
  };
  walk(root);
  return files;
}

function loadRecordsDetailed(targetPath, options = {}) {
  const opts = isObject(options) ? options : {};
  const maxFileSize = Number.isFinite(opts.maxFileSize) ? opts.maxFileSize : MAX_FILE_BYTES;
  const maxFiles = Number.isFinite(opts.maxFiles) ? opts.maxFiles : 2000;
  const sort = opts.sort === undefined ? true : Boolean(opts.sort);

  const target = path.resolve(String(targetPath === undefined || targetPath === null ? '.' : targetPath));

  let stat;
  try {
    stat = fs.statSync(target);
  } catch {
    const error = new Error(`target not found: ${target}`);
    error.code = 'TARGET_NOT_FOUND';
    throw error;
  }
  if (!stat.isDirectory()) {
    const error = new Error(`target is not a directory: ${target}`);
    error.code = 'ENOTDIR';
    throw error;
  }

  const files = collectFiles(target);
  const records = [];
  let filesRead = 0;
  let malformedLines = 0;
  let skippedFiles = 0;
  let processed = 0;

  for (const file of files) {
    if (processed >= maxFiles) {
      skippedFiles += 1;
      continue;
    }
    processed += 1;

    let size = 0;
    try {
      size = fs.statSync(file).size;
    } catch {
      skippedFiles += 1;
      continue;
    }
    if (size > maxFileSize) {
      skippedFiles += 1;
      continue;
    }

    let text = '';
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      skippedFiles += 1;
      continue;
    }
    filesRead += 1;

    const relativePath = path.relative(target, file).split(path.sep).join('/');
    const extension = path.extname(file).toLowerCase();

    if (extension === '.json') {
      const result = parseRecordsFromJson(text, relativePath);
      records.push(...result.records);
      malformedLines += result.malformed;
    } else if (extension === '.jsonl') {
      const result = parseRecordsFromJsonl(text, relativePath);
      records.push(...result.records);
      malformedLines += result.malformed;
    } else {
      records.push(...parseRecordsFromMarkdown(text, relativePath));
    }
  }

  if (sort) {
    records.sort((a, b) => (
      String(a.path).localeCompare(String(b.path))
      || a.line - b.line
      || String(a.id).localeCompare(String(b.id))
    ));
  }

  const stats = {
    target,
    filesRead,
    recordsLoaded: records.length,
    malformedLines,
    skippedFiles
  };

  return { records, stats };
}

function loadRecords(targetPath, options = {}) {
  return loadRecordsDetailed(targetPath, options).records;
}

module.exports = {
  MAX_FILE_BYTES,
  SKIP_DIRS,
  MEMORY_EXTENSIONS,
  loadRecords,
  loadRecordsDetailed,
  parseFrontmatter,
  parseRecordsFromMarkdown,
  parseRecordsFromJson,
  parseRecordsFromJsonl
};
