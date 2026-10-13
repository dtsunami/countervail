/**
 * cv_ops parsing, classification and validation.
 *
 * Same envelope discipline as davai: a JSON envelope, with out-of-band
 * payload blocks for anything multi-line. The spike's ops are short enough
 * that payloads are rarely needed, but the resolver exists so the format
 * does not have to change later.
 */

const FENCE = /```cv_ops\s*\n([\s\S]*?)\n```/;
const PAYLOAD = /--cv:([A-Za-z0-9_.-]+)--\n([\s\S]*?)\n--cv:end--/g;

export const READ_OPS = new Set(['goto', 'read', 'find', 'capture', 'wait']);
export const WRITE_OPS = new Set(['fill', 'click', 'press', 'select']);
export const TERMINAL_OPS = new Set(['done', 'escalate']);

/**
 * Commit heuristics. If a click target's accessible name matches, the op is
 * irreversible and stops for a human. Decided by the harness, never by the
 * model.
 */
export const COMMIT_PATTERN =
  /\b(confirm|cancel|terminate|close\s+account|delete|remove|pay|purchase|buy|subscribe|renew|accept|agree|submit|place\s+order|downgrade|pause|continue\s+to|yes,?\s)/i;

export function classify(op, resolvedName) {
  if (TERMINAL_OPS.has(op.op)) return 'terminal';
  if (READ_OPS.has(op.op)) return 'read';
  if (op.op === 'click') {
    const name = resolvedName ?? op.text ?? '';
    return COMMIT_PATTERN.test(name) ? 'irreversible' : 'write';
  }
  if (WRITE_OPS.has(op.op)) return 'write';
  return 'unknown';
}

export function parseCvOps(text) {
  const fence = text.match(FENCE);
  if (!fence) {
    return { ok: false, error: 'No cv_ops block found. Every turn must contain exactly one.' };
  }

  const payloads = new Map();
  let m;
  PAYLOAD.lastIndex = 0;
  while ((m = PAYLOAD.exec(text)) !== null) payloads.set(m[1], m[2]);

  let envelope;
  try {
    envelope = JSON.parse(fence[1]);
  } catch (e) {
    return { ok: false, error: `cv_ops envelope is not valid JSON: ${e.message}` };
  }
  if (!envelope || !Array.isArray(envelope.ops)) {
    return { ok: false, error: 'cv_ops envelope must be {"ops": [...]}.' };
  }

  const resolve = (v) => {
    if (typeof v !== 'string' || !v.startsWith('@')) return v;
    if (v.startsWith('@secret:')) return v; // resolved in apply, never here
    const key = v.slice(1);
    if (!payloads.has(key)) throw new Error(`payload block --cv:${key}-- referenced but not found`);
    return payloads.get(key);
  };

  try {
    const ops = envelope.ops.map((op) => {
      const out = {};
      for (const [k, v] of Object.entries(op)) out[k] = resolve(v);
      return out;
    });
    return { ok: true, ops };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/** Static validation. Runs over the whole batch before anything executes. */
export function planBatch(ops, run) {
  const errors = [];
  if (!ops.length) errors.push('Batch is empty.');

  ops.forEach((op, i) => {
    const where = `ops[${i}] (${op.op || 'missing op'})`;
    if (!op.op) {
      errors.push(`${where}: missing "op" field.`);
      return;
    }
    const known = READ_OPS.has(op.op) || WRITE_OPS.has(op.op) || TERMINAL_OPS.has(op.op);
    if (!known) {
      errors.push(`${where}: unknown op.`);
      return;
    }

    if (op.op === 'goto') {
      if (!op.url) return errors.push(`${where}: requires "url".`);
      let origin;
      try {
        origin = new URL(op.url).origin;
      } catch {
        return errors.push(`${where}: "${op.url}" is not a valid absolute URL.`);
      }
      if (!run.allowOrigins.includes(origin)) {
        errors.push(
          `${where}: origin ${origin} is not allowlisted for this run. Allowed: ${run.allowOrigins.join(', ')}`,
        );
      }
    }

    if (['click', 'fill', 'press', 'select'].includes(op.op)) {
      if (!op.ref && !op.text && !op.role) {
        errors.push(`${where}: needs "ref", or "text", or "role"+"name" to address an element.`);
      }
    }
    if (op.op === 'fill' && op.value === undefined) {
      errors.push(`${where}: requires "value".`);
    }
    if (op.op === 'done' && !op.outcome) {
      errors.push(`${where}: requires "outcome" describing what was achieved.`);
    }
    if (op.op === 'done' && !Array.isArray(op.artifacts)) {
      errors.push(`${where}: requires "artifacts", an array of capture labels already taken.`);
    }
    if (op.op === 'escalate' && !op.question) {
      errors.push(`${where}: requires "question".`);
    }
  });

  if (errors.length) return { ok: false, errors };
  return { ok: true, ops };
}

/**
 * Partition so irreversible ops can be approved one at a time after the rest
 * of the batch commits. Order is preserved within each group.
 * Shortcut — see spike/README.md "Known shortcuts".
 */
export function partition(items) {
  const normal = items.filter((it) => it.class !== 'irreversible');
  const commits = items.filter((it) => it.class === 'irreversible');
  return [...normal, ...commits];
}