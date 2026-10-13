import { chromium } from 'playwright';
import { config } from './config.js';
import { procTreeRss } from './metrics.js';

let browser = null;

export async function getBrowser() {
  if (browser && browser.isConnected()) return browser;
  browser = await chromium.launch({
    headless: config.headless,
    executablePath: config.chromiumPath,
    args: [
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-sandbox',
      '--js-flags=--max-old-space-size=512',
    ],
  });
  return browser;
}

export async function closeBrowser() {
  if (browser) {
    await browser.close().catch(() => {});
    browser = null;
  }
}

export class Driver {
  constructor(context, page) {
    this.context = context;
    this.page = page;
    this.snapshotMode = null;
  }

  static async create() {
    const b = await getBrowser();
    const context = await b.newContext({
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    return new Driver(context, page);
  }

  async close() {
    await this.context.close().catch(() => {});
  }

  rss() {
    const b = browser && browser.process ? browser.process() : null;
    return procTreeRss(b && b.pid);
  }

  /**
   * Accessibility-tree snapshot. Prefers Playwright's internal
   * _snapshotForAI() because it emits stable element refs the model can
   * address directly; falls back to the public ariaSnapshot(), which forces
   * text addressing. Which one fired is recorded per turn — token figures
   * from the two are not comparable.
   */
  async snapshot() {
    await this.page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
    await this.page.waitForTimeout(400);

    let text = null;
    let mode = null;

    if (typeof this.page._snapshotForAI === 'function') {
      try {
        text = await this.page._snapshotForAI();
        mode = 'snapshotForAI';
      } catch {
        /* fall through */
      }
    }
    if (text === null) {
      try {
        text = await this.page.locator('body').ariaSnapshot({ ref: true });
        mode = 'ariaSnapshot+ref';
      } catch {
        try {
          text = await this.page.locator('body').ariaSnapshot();
          mode = 'ariaSnapshot';
        } catch (e) {
          text = `<snapshot failed: ${e.message}>`;
          mode = 'failed';
        }
      }
    }

    this.snapshotMode = mode;
    const raw = text;
    let sent = raw;
    let truncated = false;
    if (sent.length > config.maxSnapshotChars) {
      const omitted = raw.length - config.maxSnapshotChars;
      sent =
        sent.slice(0, config.maxSnapshotChars) +
        `\n\n<<TRUNCATED: ${omitted} chars omitted. Use "find" to probe for what is missing.>>`;
      truncated = true;
    }

    const title = await this.page.title().catch(() => '');
    return { raw, sent, mode, truncated, url: this.page.url(), title };
  }

  locate(op) {
    if (op.ref) return this.page.locator(`aria-ref=${op.ref}`);
    if (op.role) return this.page.getByRole(op.role, { name: op.name ?? op.text, exact: false }).first();
    return this.page.getByText(op.text, { exact: false }).first();
  }

  /** Accessible name of a target, read before acting so commit heuristics can see it. */
  async nameOf(op) {
    if (op.text) return op.text;
    if (op.name) return op.name;
    try {
      const loc = this.locate(op);
      const aria = await loc.getAttribute('aria-label', { timeout: 3000 });
      if (aria) return aria;
      const txt = await loc.innerText({ timeout: 3000 });
      return (txt || '').trim().slice(0, 200);
    } catch {
      return '';
    }
  }

  async exec(op, ctx) {
    switch (op.op) {
      case 'goto': {
        await this.page.goto(op.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        return { ok: true, detail: `at ${this.page.url()}` };
      }
      case 'read': {
        return { ok: true, detail: 'snapshot refreshed; it is below in this message.' };
      }
      case 'wait': {
        const ms = Math.min(Number(op.ms) || 1000, 10000);
        await this.page.waitForTimeout(ms);
        return { ok: true, detail: `waited ${ms}ms` };
      }
      case 'find': {
        const loc = this.locate(op);
        const n = await loc.count().catch(() => 0);
        if (!n) return { ok: false, detail: 'no match' };
        const txt = await loc.innerText({ timeout: 3000 }).catch(() => '');
        const visible = await loc.isVisible().catch(() => false);
        return { ok: true, detail: `match: visible=${visible} text=${JSON.stringify(txt.slice(0, 200))}` };
      }
      case 'fill': {
        const loc = this.locate(op);
        let value = op.value;
        let shown = value;
        if (typeof value === 'string' && value.startsWith('@secret:')) {
          const key = value.slice('@secret:'.length);
          if (!(key in ctx.secrets)) return { ok: false, detail: `no secret named ${key}` };
          value = ctx.secrets[key];
          shown = `@secret:${key}`;
        }
        await loc.fill(String(value));
        return { ok: true, detail: `filled with ${shown}` };
      }
      case 'press': {
        const loc = this.locate(op);
        await loc.press(op.key || 'Enter');
        return { ok: true, detail: `pressed ${op.key || 'Enter'}` };
      }
      case 'select': {
        const loc = this.locate(op);
        await loc.selectOption(String(op.value));
        return { ok: true, detail: `selected ${op.value}` };
      }
      case 'click': {
        const loc = this.locate(op);
        await loc.click({ timeout: 15000 });
        await this.page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
        return { ok: true, detail: `clicked; now at ${this.page.url()}` };
      }
      case 'capture': {
        const png = await this.page.screenshot({ fullPage: false });
        return { ok: true, detail: `captured "${op.label || 'unlabelled'}"`, png, label: op.label };
      }
      default:
        return { ok: false, detail: `unimplemented op ${op.op}` };
    }
  }
}