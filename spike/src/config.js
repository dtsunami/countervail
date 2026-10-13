import 'dotenv/config';

const num = (v, d) => (v === undefined || v === '' ? d : Number(v));
const bool = (v, d) => (v === undefined || v === '' ? d : v === 'true' || v === '1');

export const config = {
  apiKey: process.env.ANTHROPIC_API_KEY || '',
  model: process.env.CV_MODEL || 'claude-sonnet-4-5',
  maxTokens: num(process.env.CV_MAX_TOKENS, 4096),

  priceIn: num(process.env.CV_PRICE_IN, 3.0),
  priceOut: num(process.env.CV_PRICE_OUT, 15.0),

  maxTurns: num(process.env.CV_MAX_TURNS, 25),
  maxSpend: num(process.env.CV_MAX_SPEND_PER_RUN, 0.5),
  maxWallClockS: num(process.env.CV_MAX_WALL_CLOCK_S, 600),

  maxSnapshotChars: num(process.env.CV_MAX_SNAPSHOT_CHARS, 60000),

  headless: bool(process.env.CV_HEADLESS, true),
  chromiumPath: process.env.CV_CHROMIUM_PATH || undefined,

  bind: process.env.CV_WEB_BIND || '127.0.0.1',
  port: num(process.env.CV_WEB_PORT, 8080),
};

// Gate thresholds from spike/README.md. Rendered on /metrics.
export const gate = {
  turns: 25,
  spend: 0.5,
  snapshotTokens: 15000,
  rssBytes: 2.5 * 1024 * 1024 * 1024,
  wallClockS: 300,
};