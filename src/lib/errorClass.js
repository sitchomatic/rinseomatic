// Classify a Browserless / network error message into a small set of
// useful buckets. Used by the worker to decide retry behaviour, and by the
// UI to render a friendly tag.
//
// transient → safe to retry (timeouts, rate-limits, network blips)
// blocked   → infra problem (proxy banned, captcha, 403) — retry once at most
// config    → site definition is wrong (selector missing, login_url 404)
// unknown   → fall back; treat as transient with low budget

const PATTERNS = [
  // transient
  { kind: 'transient', re: /\b(429|too many requests|rate.?limit)\b/i, label: 'Rate limited' },
  { kind: 'transient', re: /\b(timeout|timed.?out|etimedout|navigation: timeout)\b/i, label: 'Timeout' },
  { kind: 'transient', re: /\b(econnreset|enetunreach|socket hang up|network error)\b/i, label: 'Network' },
  { kind: 'transient', re: /\bbrowserless 5\d\d\b/i, label: 'Browserless 5xx' },

  // blocked
  { kind: 'blocked', re: /\b(captcha|challenge|cloudflare)\b/i, label: 'Captcha' },
  { kind: 'blocked', re: /\b(403|forbidden|access.?denied|blocked|ip.?block)\b/i, label: 'IP blocked' },
  { kind: 'blocked', re: /\bproxy\s+(error|auth|denied|refused)\b/i, label: 'Proxy error' },

  // config — these will not be retried
  { kind: 'config', re: /username field not found/i, label: 'Selector missing' },
  { kind: 'config', re: /no login_url/i, label: 'No login URL' },
  { kind: 'config', re: /\b(404|not found)\b/i, label: 'Login URL 404' },
  { kind: 'config', re: /credential deleted/i, label: 'Credential gone' },
];

export function classifyError(message) {
  if (!message) return { kind: 'unknown', label: 'Unknown' };
  for (const p of PATTERNS) {
    if (p.re.test(message)) return { kind: p.kind, label: p.label };
  }
  return { kind: 'unknown', label: 'Unknown' };
}

// Should this error be retried? `attempts` is the count BEFORE this attempt.
export function shouldRetry(message, attempts, maxRetries) {
  const cls = classifyError(message);
  if (cls.kind === 'config') return false;          // never retry config errors
  if (cls.kind === 'blocked') return attempts < 1;   // one retry only — likely persistent
  // transient + unknown → use the run's retry budget
  return attempts < maxRetries;
}