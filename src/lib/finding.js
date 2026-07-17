import { sha256Text, sanitizeExcerpt } from './utils.js';

export function createFinding({
  ruleId,
  title,
  severity,
  phase,
  scope,
  relativePath,
  sha256,
  line = 1,
  excerpt = '',
  explanation,
  nextCommand,
  risk,
  rollback,
  confidence = 'high',
  evidenceLocation,
}) {
  const identity = `${ruleId}|${scope}|${relativePath}|${line}|${excerpt}`;
  return {
    id: `${ruleId}-${sha256Text(identity).slice(0, 12)}`,
    ruleId,
    title,
    severity,
    confidence,
    verification: 'verified',
    phase,
    scope,
    evidence: {
      path: evidenceLocation ?? relativePath,
      line,
      sha256,
      excerpt: sanitizeExcerpt(excerpt),
    },
    explanation,
    nextCommand,
    risk,
    rollback,
  };
}
