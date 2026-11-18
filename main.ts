// NEON BAY — entrypoint for make.fun gta6-01.
// Copies game/ and screenshots/ into the output directory, then writes
// dossier.json with buildDossier from the kit's vendor/makefun-game.ts.
// Plain JavaScript only (no TypeScript syntax) so it runs on any Node 22.
// Runs on Node 22+ with no install step; deterministic: two runs write
// the same bytes.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

const dossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(out, 'dossier.json'), dossier);

console.log('NEON BAY: wrote ' + out + ' — game/ + screenshots/ copied, dossier.json ' + dossier.length + ' bytes');
