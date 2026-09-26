#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const SEED_KEY_RE = /^[a-z_]+-\d{4}$/;
const CATEGORIES = new Set(['dad_joke', 'noir', 'coquin', 'pueril']);
const RARITIES = new Set(['commune', 'rare', 'epique', 'legendaire']);

const fail = (msg) => {
  console.error(`✖ ${msg}`);
  process.exitCode = 1;
};

const raw = JSON.parse(await readFile(new URL('../jokes.json', import.meta.url)));

if (!Number.isInteger(raw.catalog_version) || raw.catalog_version < 1) {
  fail(`catalog_version must be a positive integer, got ${raw.catalog_version}`);
}
if (!Array.isArray(raw.jokes)) {
  fail('jokes must be an array');
  process.exit(1);
}

const keys = new Set();
const seqByCategory = new Map();
for (const [i, j] of raw.jokes.entries()) {
  const at = `jokes[${i}]`;
  if (typeof j?.seed_key !== 'string' || !SEED_KEY_RE.test(j.seed_key)) {
    fail(`${at}: bad seed_key ${JSON.stringify(j?.seed_key)}`);
    continue;
  }
  if (keys.has(j.seed_key)) fail(`${at}: duplicate seed_key ${j.seed_key}`);
  keys.add(j.seed_key);
  if (!CATEGORIES.has(j.category)) fail(`${at}: unknown category ${JSON.stringify(j.category)}`);
  if (typeof j.content !== 'string' || j.content.trim() === '') fail(`${at}: empty content`);
  if (!RARITIES.has(j.rarity)) fail(`${at}: bad rarity ${JSON.stringify(j.rarity)}`);

  const [cat, seq] = j.seed_key.split('-');
  if (!seqByCategory.has(cat)) seqByCategory.set(cat, []);
  seqByCategory.get(cat).push(Number(seq));
}

// Compare against master's prior state: catalog_version must strictly
// increase, and no retired seed_key may be reassigned. On a `pull_request`
// event, origin/master is genuinely unmerged, so diff against its tip. On a
// direct `push` to master, actions/checkout has already fetched a
// same-commit origin/master (it IS the commit under validation), so diffing
// against it would compare the file to itself — use the parent commit
// (master's actual prior state) instead.
const baseRef = process.env.GITHUB_EVENT_NAME === 'pull_request' ? 'origin/master' : 'HEAD^';
let masterRaw = null;
try {
  masterRaw = JSON.parse(execFileSync('git', ['show', `${baseRef}:jokes.json`], { encoding: 'utf8' }));
} catch {
  console.log(`· no ${baseRef}:jokes.json to diff against (first commit) — skipping diff checks`);
}
if (masterRaw && JSON.stringify(masterRaw) === JSON.stringify(raw)) {
  console.log('· jokes.json unchanged since base — skipping version/key-reuse checks');
  masterRaw = null;
}
if (masterRaw) {
  if (raw.catalog_version <= masterRaw.catalog_version) {
    fail(`catalog_version must increase past master (${masterRaw.catalog_version}), got ${raw.catalog_version}`);
  }
  const masterKeys = new Set(masterRaw.jokes.map((j) => j.seed_key));
  const masterMaxSeq = new Map();
  for (const j of masterRaw.jokes) {
    const [cat, seq] = j.seed_key.split('-');
    masterMaxSeq.set(cat, Math.max(masterMaxSeq.get(cat) ?? 0, Number(seq)));
  }
  const removed = [...masterKeys].filter((k) => !keys.has(k));
  // A removed key is fine (retirement). A NEW key at or below master's max seq
  // for its category means a slot was reused/renumbered.
  for (const k of keys) {
    if (masterKeys.has(k)) continue;
    const [cat, seq] = k.split('-');
    if (Number(seq) <= (masterMaxSeq.get(cat) ?? 0)) {
      fail(`${k}: new key at or below master's highest ${cat} sequence — never reuse/renumber`);
    }
  }
  if (removed.length) console.log(`· retiring ${removed.length} seed_key(s): ${removed.join(', ')}`);
}

// Warn (do not fail) on near-duplicate content.
const norm = (s) => s.toLowerCase().replace(/[\s\p{P}]+/gu, ' ').trim();
const byNorm = new Map();
for (const j of raw.jokes) {
  const n = norm(j.content);
  if (byNorm.has(n)) console.log(`⚠ possible duplicate content: ${byNorm.get(n)} ↔ ${j.seed_key}`);
  else byNorm.set(n, j.seed_key);
}

if (process.exitCode) {
  console.error('\nvalidation failed');
  process.exit(1);
}
console.log(`✓ ${raw.jokes.length} jokes, catalog_version ${raw.catalog_version}`);
