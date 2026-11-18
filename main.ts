// NEON BAY — entrypoint for make.fun gta6-01.
// Copies game/ and screenshots/ into the output directory, then writes
// dossier.json with buildDossier from the kit's vendor/makefun-game.ts.
// Runs on Node 22+ with no install step; deterministic: two runs write
// the same bytes.

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDossier } from "./vendor/makefun-game.ts";

const repoRoot = dirname(fileURLToPath(import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR || "/output";
const TEXT_MAX_BYTES = 163840;

function copyTree(src: string, dest: string): void {
  if (!existsSync(src)) {
    throw new Error("missing input directory: " + src);
  }
  mkdirSync(dest, { recursive: true });
  cpSync(src, dest, { recursive: true });
}

function main(): void {
  // Start from a clean output directory so a stale run never leaks in.
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const gameSrc = join(repoRoot, "game");
  const shotsSrc = join(repoRoot, "screenshots");
  copyTree(gameSrc, join(outDir, "game"));
  copyTree(shotsSrc, join(outDir, "screenshots"));

  const dossier = buildDossier(outDir, { text_max_bytes: TEXT_MAX_BYTES });
  const dossierPath = join(outDir, "dossier.json");
  writeFileSync(dossierPath, dossier);

  const gameFiles = countFiles(join(outDir, "game"));
  const shotFiles = countFiles(join(outDir, "screenshots"));
  console.log(
    "NEON BAY: wrote " + outDir + " — game/ " + gameFiles + " files, " +
    "screenshots/ " + shotFiles + " files, dossier.json " + dossier.length + " bytes"
  );
}

function countFiles(dir: string): number {
  // Small recursive count; the tree is shallow and tiny.
  let n = 0;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) n += countFiles(p);
    else n += 1;
  }
  return n;
}

main();
