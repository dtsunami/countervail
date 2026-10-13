import { config } from './config.js';
import { callModel, SYSTEM } from './anthropic.js';
import { Driver } from './browser.js';
import { parseCvOps, planBatch, classify, partition } from './ops.js';
import { emit, saveArtifact } from './store.js';
import { costOf, estTokens } from './metrics.js';

function mandateBlock(run) {
  const m = run.mandate;
  const secretNames = Object.keys(run.secrets).map((k) => '@secret:' + k);
  return [
    '## Run',
    `vendor:            ${run.vendor}`,
    `objective:         ${run.objective}`,
    `allowed origins:   ${run.allowOrigins.join(', ')}`,
    `available secrets: ${secretNames.join(', ') || '(none)'}`,
    '',
    'mandate:',
    `  retention_offers:  ${m.retentionOffers}`,
    `  downgrade_instead: ${m.downgrade}`,
    `  pause_instead:     ${m.pause}`,
    `  spend_authority:   ${m.spendAuthority}`,
    `  identity_evidence: ${m.identityEvidence || '(none provided — escalate on any identity challenge)'}`,
  ].join('\n');
}

function snapshotBlock(snap) {
  return [
    '## Page',
    `url:   ${snap.url}`,
    `title: ${snap.title}`,
    `mode:  ${snap.mode}${snap.truncated ? ' (TRUNCATED)' : ''}`,
    '',
    '```',
    snap.sent,
    '```',
  ].join('\n');
}

function resultsBlock(results) {
  if (!results || !results.length) return '';
  const lines = results.map((r, i) => `[${i}] ${r.op.op}: ${r.ok ? 'ok' : 'FAILED'} — ${r.detail}`);
  return [
    '## Results of your last cv_ops batch',
    'The authoritative record of what happened, not what you expected.',
    '',
    '```',
    lines.join('\n'),
    '```',
    '',
  ].join('\n');
}

function requestApproval(run, item) {
  run.metrics.approvalsRequested += 1;
  const id = `${run.id}-ap-${run.metrics.approvalsRequested}`;
  const askedAt = Date.now();

  emit(run, 'approval_request', {
    approvalId: id,
    op: item.op,
    targetName: item.resolvedName,
    url: item.url,
    reason: 'Target matches commit heuristics — irreversible.',
  });

  return new Promise((resolve) => {
    run.pending = {
      id,
      op: item.op,
      targetName: item.resolvedName,
      url: item.url,
      askedAt,
      resolve: (decision) => {
        run.metrics.humanSeconds += (Date.now() - askedAt) / 1000;
        if (decision === 'approve') run.metrics.approvalsGranted += 1;
        run.pending = null;
        emit(run, 'approval_resolved', { approvalId: id, decision });
        resolve(decision);
      },
    };
    run.bus.emit('update', { type: 'pending' });
  });
}

export async function runAgent(run) {
  let driver = null;
  run.status = 'running';
  emit(run, 'run_started', { vendor: run.vendor, objective: run.objective });

  try {
    driver = await Driver.create();
    await driver.page.goto(run.startUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    const messages = [];
    let lastResults = null;
    let terminal = null;

    for (let turn = 1; turn <= config.maxTurns; turn++) {
      if (run.killed) {
        terminal = { kind: 'killed', note: 'Kill switch.' };
        break;
      }
      const wall = (Date.now() - run.createdAt) / 1000;
      if (wall > config.maxWallClockS) {
        terminal = { kind: 'budget', note: `Wall clock ceiling (${config.maxWallClockS}s) hit.` };
        break;
      }
      if (run.metrics.spend > config.maxSpend) {
        terminal = { kind: 'budget', note: `Spend ceiling ($${config.maxSpend}) hit.` };
        break;
      }

      const snap = await driver.snapshot();
      run.metrics.snapshotCharsRaw.push(snap.raw.length);
      run.metrics.snapshotCharsSent.push(snap.sent.length);
      run.metrics.snapshotModes[snap.mode] = (run.metrics.snapshotModes[snap.mode] || 0) + 1;

      const rss = driver.rss();
      if (rss && (!run.metrics.peakRssBytes || rss > run.metrics.peakRssBytes)) {
        run.metrics.peakRssBytes = rss;
      }

      const userContent =
        turn === 1
          ? [mandateBlock(run), '', snapshotBlock(snap), '', 'Begin. One cv_ops block.'].join('\n')
          : [resultsBlock(lastResults), snapshotBlock(snap)].join('\n');

      messages.push({ role: 'user', content: userContent });

      let resp;
      try {
        resp = await callModel({ system: SYSTEM, messages });
      } catch (e) {
        terminal = { kind: 'error', note: `Provider call failed: ${e.message}` };
        break;
      }

      const spend = costOf(resp.usage);
      run.metrics.turns = turn;
      run.metrics.inputTokens += resp.usage.input_tokens || 0;
      run.metrics.outputTokens += resp.usage.output_tokens || 0;
      run.metrics.spend += spend;

      messages.push({ role: 'assistant', content: resp.text });

      const turnRecord = {
        n: turn,
        text: resp.text,
        usage: resp.usage,
        spend,
        latencyMs: resp.latencyMs,
        snapshotMode: snap.mode,
        snapshotCharsRaw: snap.raw.length,
        snapshotCharsSent: snap.sent.length,
        snapshotTokensEst: estTokens(snap.sent),
        truncated: snap.truncated,
        rssBytes: rss,
        url: snap.url,
        ops: [],
        results: [],
      };
      run.turns.push(turnRecord);
      emit(run, 'turn', {
        n: turn,
        spend,
        latencyMs: resp.latencyMs,
        inputTokens: resp.usage.input_tokens || 0,
        outputTokens: resp.usage.output_tokens || 0,
        snapshotTokensEst: turnRecord.snapshotTokensEst,
        snapshotCharsRaw: snap.raw.length,
        truncated: snap.truncated,
        rssBytes: rss,
        mode: snap.mode,
        url: snap.url,
      });

      // --- plan -------------------------------------------------------
      const parsed = parseCvOps(resp.text);
      if (!parsed.ok) {
        lastResults = [{ op: { op: 'parse' }, ok: false, detail: parsed.error }];
        turnRecord.results = lastResults;
        emit(run, 'plan_rejected', { n: turn, errors: [parsed.error] });
        continue;
      }
      turnRecord.ops = parsed.ops;

      const plan = planBatch(parsed.ops, run);
      if (!plan.ok) {
        lastResults = plan.errors.map((e) => ({ op: { op: 'plan' }, ok: false, detail: e }));
        turnRecord.results = lastResults;
        emit(run, 'plan_rejected', { n: turn, errors: plan.errors });
        continue;
      }

      // Classify. Commit heuristics need the target's accessible name, so
      // resolve it before deciding — the harness decides, never the model.
      const items = [];
      for (const op of plan.ops) {
        let resolvedName = null;
        if (op.op === 'click') resolvedName = await driver.nameOf(op);
        items.push({ op, class: classify(op, resolvedName), resolvedName, url: driver.page.url() });
      }
      const ordered = partition(items);
      emit(run, 'plan_accepted', {
        n: turn,
        ops: ordered.map((it) => ({
          op: it.op.op,
          class: it.class,
          target: it.resolvedName || it.op.text || it.op.ref || it.op.url || null,
        })),
      });

      // --- apply ------------------------------------------------------
      const results = [];
      for (const item of ordered) {
        if (run.killed) {
          results.push({ op: item.op, ok: false, detail: 'kill switch' });
          break;
        }

        if (item.class === 'terminal') {
          terminal =
            item.op.op === 'done'
              ? { kind: 'done', note: item.op.outcome, artifacts: item.op.artifacts }
              : { kind: 'escalate', note: item.op.question, safeDefault: item.op.safe_default };
          results.push({ op: item.op, ok: true, detail: `terminal: ${item.op.op}` });
          break;
        }

        if (item.class === 'irreversible') {
          const decision = await requestApproval(run, item);
          if (decision !== 'approve') {
            results.push({
              op: item.op,
              ok: false,
              detail: `DENIED by the human. Target was "${item.resolvedName}". Do not retry it; find another route or escalate.`,
            });
            break;
          }
        }

        try {
          const r = await driver.exec(item.op, { secrets: run.secrets });
          if (r.png) {
            const safeLabel = String(item.op.label || 'capture').replace(/\W+/g, '-').slice(0, 40);
            const file = saveArtifact(run, `t${turn}-${safeLabel}.png`, r.png);
            r.artifact = file;
            delete r.png;
            emit(run, 'artifact', { n: turn, file, label: item.op.label });
          }
          results.push({ op: item.op, ok: r.ok, detail: r.detail, artifact: r.artifact });
        } catch (e) {
          results.push({ op: item.op, ok: false, detail: `${e.name}: ${String(e.message).split('\n')[0]}` });
        }
      }

      turnRecord.results = results;
      lastResults = results;
      emit(run, 'applied', {
        n: turn,
        results: results.map((r) => ({ op: r.op.op, ok: r.ok, detail: r.detail })),
      });

      if (terminal) break;
    }

    if (!terminal) terminal = { kind: 'budget', note: `Turn ceiling (${config.maxTurns}) hit.` };
    run.status = terminal.kind;
    run.outcomeNote = terminal.note;
    run.endedAt = Date.now();
    emit(run, 'run_ended', terminal);
  } catch (e) {
    run.status = 'error';
    run.outcomeNote = e.message;
    run.endedAt = Date.now();
    emit(run, 'run_ended', { kind: 'error', note: e.message });
  } finally {
    if (run.pending) run.pending.resolve('deny');
    run.secrets = {}; // in-memory only, and only for the run
    if (driver) await driver.close();
    run.bus.emit('update', { type: 'ended' });
  }
}