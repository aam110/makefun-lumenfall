// LUMENFALL — the entry program for make.fun's best-game-01 bounty.
//
// What this program does: it hands the game in. The playable game lives in
// this repository as plain static files under game/ (an index.html plus ES
// modules, no build step, no network request), and the screenshots live in
// screenshots/. This program copies both trees to the output directory and
// writes dossier.json there with the kit's own buildDossier library, so the
// sealed scorer and the AI judge both read exactly what the library writes.
//
// The grader runs this file twice, in a fresh container with no network, and
// both runs must write the same bytes. It runs on Node 22 with the standard
// library only — nothing is installed before it runs — so this file imports
// only node: builtins plus the vendored, unmodified ./vendor/makefun-game.ts.
//
// Run it locally the same way the grader does, with MAKEFUN_OUTPUT_DIR
// standing in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Play the game locally with `node serve.ts`, then open http://localhost:8080.

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outputDir, { recursive: true });
cpSync(join(repoRoot, 'game'), join(outputDir, 'game'), { recursive: true });
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
if (existsSync(join(repoRoot, 'screenshots'))) {
  cpSync(join(repoRoot, 'screenshots'), join(outputDir, 'screenshots'), { recursive: true });
}

// The scorer's own caps, as the kit's reference/gate.json sets them: the
// dossier text is capped at 160 KiB; screenshots are at most 4 files of at
// most 256 KiB each; game/ holds at most 993 files and directories and
// 48 MiB in all, with no path longer than 1,000 UTF-8 bytes.
const dossier = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outputDir, 'dossier.json'), dossier);

// A one-line receipt on stdout, so a run's log shows what was handed in:
// the game files, the screenshots and the dossier's size.
const countFiles = (dir) => {
  let n = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    n += entry.isDirectory() ? countFiles(join(dir, entry.name)) : 1;
  }
  return n;
};
const shots = existsSync(join(outputDir, 'screenshots'))
  ? readdirSync(join(outputDir, 'screenshots')).filter((n) => !n.startsWith('.')).length
  : 0;
console.log(
  `LUMENFALL handed in: ${countFiles(join(outputDir, 'game'))} game files, ` +
  `${shots} screenshots, dossier.json ${statSync(join(outputDir, 'dossier.json')).size} bytes ` +
  `(${JSON.parse(readFileSync(join(outputDir, 'dossier.json'), 'utf8')).text.length} chars of source text).`,
);
