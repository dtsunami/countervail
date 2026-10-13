import fs from 'node:fs';
import { config, gate } from './config.js';

// chars/4. Crude, and used only for the snapshot-specific figure — real
// totals come from the API response and are exact.
export const estTokens = (s) => Math.round((s?.length || 0) / 4);

export function costOf(usage) {
  const inTok = usage.input_tokens || 0;
  const outTok = usage.output_tokens || 0;
  return (inTok * config.priceIn + outTok * config.priceOut) / 1_000_000;
}

export function p95(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * 0.95))];
}

/**
 * Sum RSS across a process tree by walking /proc. Linux only — Chromium
 * spawns renderer and GPU children, and measuring only the root process
 * understates by multiples.
 */
export function procTreeRss(rootPid) {
  if (process.platform !== 'linux' || !rootPid) return null;
  let pids;
  try {
    pids = fs.readdirSync('/proc').filter((d) => /^\d+$/.test(d)).map(Number);
  } catch {
    return null;
  }

  const parent = new Map();
  for (const pid of pids) {
    try {
      const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
      // comm may contain spaces and parens; ppid is the field after the final ')'
      const tail = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
      parent.set(pid, Number(tail[1]));
    } catch {
      /* process exited mid-walk */
    }
  }

  const tree = new Set([rootPid]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const [pid, ppid] of parent) {
      if (!tree.has(pid) && tree.has(ppid)) {
        tree.add(pid);
        grew = true;
      }
    }
  }

  let total = 0;
  for (const pid of tree) {
    try {
      const status = fs.readFileSync(`/proc/${pid}/status`, 'utf8');
      const m = status.match(/^VmRSS:\s+(\d+) kB$/m);
      if (m) total += Number(m[1]) * 1024;
    } catch {
      /* ignore */
    }
  }
  return total || null;
}

export function summarise(run) {
  const m = run.metrics;
  const wall = ((run.endedAt || Date.now()) - run.createdAt) / 1000;
  const sentTokens = m.snapshotCharsSent.map(estTokens);
  return {
    turns: m.turns,
    spend: m.spend,
    inputTokens: m.inputTokens,
    outputTokens: m.outputTokens,
    snapshotP95Tokens: p95(sentTokens),
    snapshotMaxTokens: sentTokens.length ? Math.max(...sentTokens) : 0,
    truncatedTurns: m.snapshotCharsRaw.filter((c) => c > config.maxSnapshotChars).length,
    peakRssBytes: m.peakRssBytes,
    wallClockS: wall,
    approvalsRequested: m.approvalsRequested,
    approvalsGranted: m.approvalsGranted,
    humanSeconds: m.humanSeconds,
    modes: m.snapshotModes,
  };
}

export function gradeRun(s) {
  return {
    turns: s.turns <= gate.turns,
    spend: s.spend <= gate.spend,
    snapshotP95Tokens: s.snapshotP95Tokens <= gate.snapshotTokens,
    peakRssBytes: s.peakRssBytes === null ? null : s.peakRssBytes <= gate.rssBytes,
    wallClockS: s.wallClockS <= gate.wallClockS,
  };
}