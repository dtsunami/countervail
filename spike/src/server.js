import Fastify from 'fastify';
import formbody from '@fastify/formbody';
import fs from 'node:fs';
import { config } from './config.js';
import { createRun, getRun, listRuns, artifactPath, emit } from './store.js';
import { runAgent } from './agent.js';
import { closeBrowser } from './browser.js';
import { dashboard, runPage, runFragment, metricsPage, layout } from './ui.js';

export async function startServer() {
  const app = Fastify({ logger: false });
  await app.register(formbody);

  app.get('/', async (req, reply) => reply.type('text/html').send(dashboard(listRuns())));

  app.post('/runs', async (req, reply) => {
    const b = req.body || {};
    const fail = (msg) =>
      reply
        .type('text/html')
        .send(layout('Error', `<div class="card"><h1>${msg}</h1><a href="/">Back</a></div>`));

    const origins = String(b.allowOrigins || '')
      .split(/\s+/)
      .filter(Boolean)
      .map((o) => {
        try {
          return new URL(o).origin;
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    if (!b.startUrl || !origins.length) {
      return fail('Start URL and at least one valid origin are required.');
    }
    try {
      const startOrigin = new URL(b.startUrl).origin;
      if (!origins.includes(startOrigin)) origins.push(startOrigin);
    } catch {
      return fail('Start URL is not a valid absolute URL.');
    }

    const secrets = {};
    for (const [k, v] of Object.entries(b)) {
      if (k.startsWith('s_') && v) secrets[k.slice(2)] = v;
    }

    const run = createRun({
      vendor: b.vendor || 'unnamed',
      startUrl: b.startUrl,
      allowOrigins: origins,
      objective: b.objective || 'Cancel the subscription and capture proof.',
      mandate: {
        retentionOffers: b.declineOffers ? 'decline_all' : 'escalate_all',
        downgrade: !b.refuseDowngrade,
        pause: !b.refusePause,
        spendAuthority: '0.00',
        identityEvidence: b.identityEvidence || '',
      },
      secrets,
    });

    runAgent(run).catch((e) => {
      run.status = 'error';
      run.outcomeNote = e.message;
      run.endedAt = Date.now();
      emit(run, 'run_ended', { kind: 'error', note: e.message });
    });

    return reply.redirect(`/runs/${run.id}`, 303);
  });

  app.get('/runs/:id', async (req, reply) => {
    const run = getRun(req.params.id);
    if (!run) return reply.code(404).send('no such run');
    return reply.type('text/html').send(runPage(run));
  });

  app.get('/runs/:id/fragment', async (req, reply) => {
    const run = getRun(req.params.id);
    if (!run) return reply.code(404).send('no such run');
    return reply.type('text/html').send(runFragment(run));
  });

  app.get('/runs/:id/events', (req, reply) => {
    const run = getRun(req.params.id);
    if (!run) return reply.code(404).send('no such run');

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    reply.raw.write('retry: 2000\n\n');

    const onUpdate = () => {
      try {
        reply.raw.write('data: 1\n\n');
      } catch {
        /* client gone */
      }
    };
    run.bus.on('update', onUpdate);
    const ping = setInterval(onUpdate, 20000);
    req.raw.on('close', () => {
      clearInterval(ping);
      run.bus.off('update', onUpdate);
    });
  });

  app.post('/runs/:id/approve', async (req, reply) => {
    const run = getRun(req.params.id);
    if (!run) return reply.code(404).send('no such run');
    if (run.pending) {
      run.pending.resolve((req.body && req.body.decision) === 'approve' ? 'approve' : 'deny');
    }
    return reply.redirect(`/runs/${run.id}`, 303);
  });

  app.post('/runs/:id/kill', async (req, reply) => {
    const run = getRun(req.params.id);
    if (!run) return reply.code(404).send('no such run');
    run.killed = true;
    if (run.pending) run.pending.resolve('deny');
    emit(run, 'kill_switch', {});
    return reply.redirect(`/runs/${run.id}`, 303);
  });

  app.get('/metrics', async (req, reply) => reply.type('text/html').send(metricsPage(listRuns())));

  app.get('/artifacts/:file', async (req, reply) => {
    const p = artifactPath(req.params.file);
    if (!p || !fs.existsSync(p)) return reply.code(404).send('no such artifact');
    return reply.type('image/png').send(fs.createReadStream(p));
  });

  if (config.bind === '0.0.0.0') {
    console.warn('\n  WARNING: binding 0.0.0.0. There is no TLS and no auth on this spike.\n');
  }

  await app.listen({ host: config.bind, port: config.port });
  console.log(`\n  Countervail spike on http://${config.bind}:${config.port}`);
  console.log(`  model: ${config.model}  ceiling: ${config.maxTurns} turns / $${config.maxSpend} / ${config.maxWallClockS}s`);
  console.log(`  headless: ${config.headless}${config.chromiumPath ? `  chromium: ${config.chromiumPath}` : ''}\n`);

  const shutdown = async () => {
    await closeBrowser();
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}