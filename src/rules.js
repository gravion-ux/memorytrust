'use strict';
// Trust rule catalogue: every rule defines an id, category, severity and a test.

const { isPlaceholder, looksSecret } = require('./redact.js');
const { missingRequiredFields } = require('./schema.js');

const DAY_MS = 24 * 60 * 60 * 1000;

function isLuhnValid(digits) {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let value = digits.charCodeAt(i) - 48;
    if (value < 0 || value > 9) return false;
    if (double) {
      value *= 2;
      if (value > 9) value -= 9;
    }
    sum += value;
    double = !double;
  }
  return sum % 10 === 0;
}

function toNow(context) {
  if (context && context.now instanceof Date && !Number.isNaN(context.now.getTime())) return context.now;
  if (context && context.now) {
    const parsed = new Date(context.now);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

function toMaxAgeDays(context) {
  const value = context && context.maxAgeDays;
  return Number.isFinite(value) ? value : 180;
}

function sourceOf(record) {
  return record && typeof record.source === 'string' ? record.source.trim() : '';
}

function matchesFrom(text, patterns) {
  const source = typeof text === 'string' ? text : '';
  const found = [];
  for (const pattern of patterns) {
    const match = pattern.re.exec(source);
    if (!match) continue;
    found.push({
      index: match.index,
      excerpt: match[0],
      message: pattern.message
    });
  }
  return found.length ? found : null;
}

const INJECTION_PATTERNS = [
  {
    re: /\b(?:ignore|disregard|forget)\s+(?:all\s+)?(?:of\s+)?(?:the\s+|your\s+)?(?:previous|prior|preceding|above|earlier|initial)\s+(?:instructions?|prompts?|rules?|directions?|guidelines?|training)\b/i,
    message: 'Content tells an agent to ignore its previous instructions.'
  },
  {
    re: /\byou\s+are\s+now\b[^.\n]{0,40}\bmode\b/i,
    message: 'Content switches the agent into a different mode.'
  },
  {
    re: /\b(?:do\s+not|don'?t|never)\s+(?:ever\s+)?tell\s+the\s+user\b/i,
    message: 'Content tells an agent to hide information from the user.'
  },
  {
    re: /\b(?:reveal|print|show|repeat)\s+(?:your|the)\s+(?:full\s+)?(?:system\s+)?(?:prompt|instructions)\b/i,
    message: 'Content asks an agent to reveal its system prompt.'
  },
  {
    re: /\byou\s+must\s+(?:now\s+)?(?:ignore|obey|execute|comply)\b/i,
    message: 'Content issues an overriding command to an agent.'
  }
];

const THIRD_PARTY_RE = /\b(?:spouse|wife|husband|partner|boyfriend|girlfriend|mother|father|mom|dad|son|daughter|brother|sister|sibling|colleague|co-?worker|boss|manager|landlord|neighbou?r|therapist|doctor|patient|friend)\b/i;

const RULES = [
  {
    id: 'MT-PROV-001',
    category: 'provenance',
    severity: 'high',
    description: 'Record has no source at all, so the claim cannot be traced back to an origin.',
    remediation: 'Record where the memory came from (conversation id, file path, ticket) in the `source` field.',
    test(text, context) {
      const record = (context && context.record) || {};
      if (sourceOf(record)) return null;
      return { message: 'Record has no source: the claim cannot be traced back to an origin.' };
    }
  },
  {
    id: 'MT-PROV-002',
    category: 'provenance',
    severity: 'medium',
    description: 'Source is a bare URL that is neither archived nor pinned to an immutable revision.',
    remediation: 'Point the source at an archived copy (web.archive.org) or a pinned commit, tag or content hash.',
    test(text, context) {
      const record = (context && context.record) || {};
      const source = sourceOf(record);
      if (!/^https?:\/\//i.test(source)) return null;
      if (/(?:web\.archive\.org|archive\.ph|arquivo\.pt|webcache|wayback|perma\.cc|ghostarchive)/i.test(source)) return null;
      if (/(?:[0-9a-f]{7,40}\b|@v?\d+|commit|\/blob\/|\/tree\/|\/tag\/|rev=|version=|sha=|\/v\d+)/i.test(source)) return null;
      return { message: `Source is an unpinned URL: ${source}` };
    }
  },
  {
    id: 'MT-PROV-003',
    category: 'provenance',
    severity: 'medium',
    description: 'Confidence is below 0.5, so the store itself doubts the claim.',
    remediation: 'Raise confidence only after verification; otherwise delete the low-confidence claim or mark it as a hypothesis.',
    test(text, context) {
      const record = (context && context.record) || {};
      const confidence = Number(record.confidence);
      if (!Number.isFinite(confidence) || confidence >= 0.5) return null;
      return { message: `Confidence ${confidence} is below 0.5: the store itself doubts this claim.` };
    }
  },
  {
    id: 'MT-FRESH-001',
    category: 'freshness',
    severity: 'medium',
    description: 'Record was created longer ago than the configured freshness window.',
    remediation: 'Re-verify the claim and refresh `createdAt`, or remove it if it no longer holds.',
    test(text, context) {
      const record = (context && context.record) || {};
      if (!record.createdAt) return null;
      const created = new Date(record.createdAt);
      if (Number.isNaN(created.getTime())) return null;
      const now = toNow(context);
      const ageDays = (now.getTime() - created.getTime()) / DAY_MS;
      const maxAgeDays = toMaxAgeDays(context);
      if (ageDays <= maxAgeDays) return null;
      return { message: `Record is ${Math.floor(ageDays)} days old, older than the ${maxAgeDays}-day freshness window.` };
    }
  },
  {
    id: 'MT-FRESH-002',
    category: 'freshness',
    severity: 'high',
    description: 'Record has expired: `expiresAt` is in the past.',
    remediation: 'Delete the expired memory or extend `expiresAt` once the claim has been re-confirmed.',
    test(text, context) {
      const record = (context && context.record) || {};
      if (!record.expiresAt) return null;
      const expires = new Date(record.expiresAt);
      if (Number.isNaN(expires.getTime())) return null;
      const now = toNow(context);
      if (expires.getTime() >= now.getTime()) return null;
      return { message: `Record expired on ${record.expiresAt} and is still stored.` };
    }
  },
  {
    id: 'MT-CONF-001',
    category: 'conflict',
    severity: 'high',
    description: 'Two records share an id but disagree on content.',
    remediation: 'Merge the conflicting claims into one record, or give the losing claim a distinct id.',
    test(text, context) {
      const record = (context && context.record) || {};
      const records = Array.isArray(context && context.records) ? context.records : [];
      const id = String(record.id || '');
      const others = records.filter((entry) => entry && entry !== record && String(entry.id || '') === id);
      const differing = others.filter((entry) => String(entry.content || '') !== String(record.content || ''));
      if (!differing.length) return null;
      return { message: `Record "${id}" conflicts with ${differing.length} other record(s) that have different content.` };
    }
  },
  {
    id: 'MT-CONF-002',
    category: 'conflict',
    severity: 'medium',
    description: 'Two records share an id and content: a duplicate.',
    remediation: 'Delete the duplicate record so the memory is stored once.',
    test(text, context) {
      const record = (context && context.record) || {};
      const records = Array.isArray(context && context.records) ? context.records : [];
      const id = String(record.id || '');
      const others = records.filter((entry) => entry && entry !== record && String(entry.id || '') === id);
      const same = others.filter((entry) => String(entry.content || '') === String(record.content || ''));
      if (!same.length) return null;
      return { message: `Record "${id}" is duplicated ${same.length} time(s) with identical content.` };
    }
  },
  {
    id: 'MT-SENS-001',
    category: 'sensitivity',
    severity: 'critical',
    description: 'Record content contains a private key, AWS access key id, GitHub token, Slack token or sk- key.',
    remediation: 'Remove the secret from the memory store, rotate the credential, and store only a reference to the secret manager.',
    test(text) {
      return matchesFrom(text, [
        { re: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/, message: 'Content contains a private key block.' },
        { re: /\bAKIA[0-9A-Z]{16}\b/, message: 'Content contains an AWS access key id.' },
        { re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{16,}\b/, message: 'Content contains a GitHub token.' },
        { re: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/, message: 'Content contains a GitHub fine-grained token.' },
        { re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/, message: 'Content contains a Slack token.' },
        { re: /\bsk-[A-Za-z0-9_-]{16,}\b/, message: 'Content contains an sk- API key.' }
      ]);
    }
  },
  {
    id: 'MT-SENS-002',
    category: 'sensitivity',
    severity: 'high',
    description: 'Record content contains a credential assignment with a literal value.',
    remediation: 'Replace the literal credential with a secret-manager reference such as `env://SERVICE_TOKEN`.',
    test(text) {
      const source = typeof text === 'string' ? text : '';
      const re = /\b(password|passwd|pwd|api[_-]?key|secret|client[_-]?secret|access[_-]?token|auth[_-]?token|token)\b(\s*[:=]\s*)(["']?)([^\s"',;]+)/gi;
      const found = [];
      let match;
      while ((match = re.exec(source)) !== null) {
        const key = match[1];
        const value = String(match[4] || '').trim();
        if (!value) continue;
        if (isPlaceholder(value)) continue;
        if (/^(?:process\.env|\$|<)/i.test(value)) continue;
        if (!looksSecret(value)) continue;
        found.push({
          index: match.index,
          excerpt: match[0],
          message: `Content contains a ${key} assignment with a literal value.`
        });
      }
      return found.length ? found : null;
    }
  },
  {
    id: 'MT-PRIV-001',
    category: 'privacy',
    severity: 'high',
    description: 'Record content contains an email address.',
    remediation: 'Remove the email address and keep a non-identifying reference instead.',
    test(text) {
      return matchesFrom(text, [
        { re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/, message: 'Content contains an email address.' }
      ]);
    }
  },
  {
    id: 'MT-PRIV-002',
    category: 'privacy',
    severity: 'medium',
    description: 'Record content contains a phone number or a credit-card-like number.',
    remediation: 'Remove the number from the memory store and keep a masked or hashed reference instead.',
    test(text) {
      const source = typeof text === 'string' ? text : '';
      const found = [];
      const cardDigits = [];

      const cardRe = /\b(?:\d[ -]?){13,19}\b/g;
      let card;
      while ((card = cardRe.exec(source)) !== null) {
        const digits = card[0].replace(/\D/g, '');
        if (digits.length >= 13 && digits.length <= 19 && isLuhnValid(digits)) {
          cardDigits.push(digits);
          found.push({ index: card.index, excerpt: card[0], message: 'Content contains a credit-card-like number.' });
        }
      }

      const phoneRe = /(?:\+\d{1,3}[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]\d{3,4}[\s.-]\d{3,4}/g;
      let phone;
      while ((phone = phoneRe.exec(source)) !== null) {
        const digits = phone[0].replace(/\D/g, '');
        if (digits.length < 10 || digits.length > 15) continue;
        if (isLuhnValid(digits)) continue;
        if (cardDigits.some((entry) => entry.includes(digits))) continue;
        found.push({ index: phone.index, excerpt: phone[0], message: 'Content contains a phone number.' });
      }

      return found.length ? found : null;
    }
  },
  {
    id: 'MT-PRIV-003',
    category: 'privacy',
    severity: 'medium',
    description: 'Record content contains personal data about a third party without recorded consent.',
    remediation: 'Remove the third-party detail, or record explicit consent for that person before storing it.',
    test(text, context) {
      const record = (context && context.record) || {};
      if (record.consent === true) return null;
      const source = typeof text === 'string' ? text : '';
      const match = THIRD_PARTY_RE.exec(source);
      if (!match) return null;
      return {
        index: match.index,
        excerpt: match[0],
        message: `Content mentions a third party ("${match[0]}") without recorded consent.`
      };
    }
  },
  {
    id: 'MT-STRUCT-001',
    category: 'structure',
    severity: 'medium',
    description: 'Required field `id` is missing or empty.',
    remediation: 'Give every record a stable, unique id so it can be updated and de-duplicated.',
    test(text, context) {
      const record = (context && context.record) || {};
      if (!missingRequiredFields(record).includes('id')) return null;
      return { message: 'Record has no id: required field `id` is missing or empty.' };
    }
  },
  {
    id: 'MT-STRUCT-002',
    category: 'structure',
    severity: 'medium',
    description: 'Required field `content` is missing or empty.',
    remediation: 'Store the remembered content, or delete the empty record.',
    test(text, context) {
      const record = (context && context.record) || {};
      if (!missingRequiredFields(record).includes('content')) return null;
      return { message: 'Record has no content: required field `content` is missing or empty.' };
    }
  },
  {
    id: 'MT-INJ-001',
    category: 'injection',
    severity: 'critical',
    description: 'Record content contains instruction-shaped text aimed at an agent.',
    remediation: 'Delete the instruction-shaped content; treat stored memories as data, never as instructions.',
    test(text) {
      return matchesFrom(text, INJECTION_PATTERNS);
    }
  },
  {
    id: 'MT-INJ-002',
    category: 'injection',
    severity: 'high',
    description: 'Record content contains a pipe-to-shell command.',
    remediation: 'Remove the command from the memory store and treat the record as compromised.',
    test(text) {
      return matchesFrom(text, [
        { re: /\b(?:curl|wget)\s+[^\n]{0,200}\|\s*(?:sudo\s+)?(?:sh|bash|zsh|ksh|python3?|perl|ruby|node)\b/i, message: 'Content contains a pipe-to-shell command.' }
      ]);
    }
  }
];

function ruleCatalogue() {
  return RULES.map((rule) => ({
    id: rule.id,
    category: rule.category,
    severity: rule.severity,
    description: rule.description,
    remediation: rule.remediation
  }));
}

function getRule(id) {
  const key = String(id || '').trim().toUpperCase();
  return RULES.find((rule) => rule.id === key) || null;
}

module.exports = {
  RULES,
  ruleCatalogue,
  getRule
};
