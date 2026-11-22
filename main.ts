// Ember Duel — make.fun entry packager.
//
// Packs this repo's card game for the make.fun judge: it copies the playable
// files in game/ and the cover screenshots in screenshots/ into the output
// directory, then writes dossier.json there, the summary the judge reads.
// The game itself is plain static files (game/index.html plus its JS/CSS),
// loadable offline in a desktop browser with no network requests.
//
// Run it locally with:
//   MAKEFUN_OUTPUT_DIR=out node main.ts
// and serve the result with `node serve.ts` (http://localhost:8080).
// Inside the grader's container the output directory is /output by default.

import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// Where this file lives on disk, so the game and screenshots are found
// relative to the entrypoint no matter where the process is launched from.
const repoRoot = dirname(fileURLToPath(import.meta.url));

// The grader sets MAKEFUN_OUTPUT_DIR; outside its container it defaults
// to /output. An empty value is treated as unset, not as a relative path.
const outputDir = resolve(process.env.MAKEFUN_OUTPUT_DIR?.trim() || '/output');

// Scorer caps from reference/gate.json. text_max_bytes is the only one that
// shapes the dossier bytes; the rest make the packager refuse an entry the
// scorer would refuse outright: more than 4 screenshots, or one over 256 KiB;
// more than 993 files in game/, or 48 MiB of game files in total, or a path
// under game/ longer than 1000 bytes. (game/ also counts against /output's
// own 1000-entry cap, alongside screenshots/ and dossier.json.)
const DOSSIER_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
} as const;

// Refuse to package a broken entry instead of handing the judge a game
// that cannot start: the entry point has to exist before anything is copied.
function requireGameEntryPoint(root: string): string {
  const entry = join(root, 'game', 'index.html');
  if (!existsSync(entry)) {
    throw new Error(`Ember Duel: game/index.html is missing at ${entry}`);
  }
  return entry;
}

// Copy one folder from the repo into the output tree, creating the target
// first and reporting how many entries landed, so a silent empty copy is
// obvious in the log instead of surfacing later as a failed judging run.
function copyFolderInto(source: string, target: string, label: string): number {
  mkdirSync(target, { recursive: true });
  cpSync(source, target, { recursive: true });
  const count = readdirSync(target).length;
  console.log(`Ember Duel: copied ${count} ${label} -> ${target}`);
  return count;
}

function main(): void {
  requireGameEntryPoint(repoRoot);
  mkdirSync(outputDir, { recursive: true });

  copyFolderInto(join(repoRoot, 'game'), join(outputDir, 'game'), 'game files');

  const shotsSource = join(repoRoot, 'screenshots');
  if (existsSync(shotsSource)) {
    copyFolderInto(shotsSource, join(outputDir, 'screenshots'), 'screenshots');
  } else {
    console.log('Ember Duel: no screenshots/ folder found, skipping it');
  }

  const dossierPath = join(outputDir, 'dossier.json');
  writeFileSync(dossierPath, buildDossier(outputDir, DOSSIER_CAPS));
  console.log(`Ember Duel: wrote ${dossierPath}`);
}

main();
