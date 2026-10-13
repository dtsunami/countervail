#!/usr/bin/env node
import { startServer } from './src/server.js';
import { config } from './src/config.js';

if (!config.apiKey) {
  console.error('\n  Missing required config: ANTHROPIC_API_KEY');
  console.error('  See the config template in spike/README.md.\n');
  process.exit(1);
}

startServer().catch((err) => {
  console.error(err);
  process.exit(1);
});