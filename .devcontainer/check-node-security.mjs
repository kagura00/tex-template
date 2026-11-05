import { readFile } from 'node:fs/promises';

const dockerfile = await readFile(new URL('./Dockerfile', import.meta.url), 'utf8');
const pinned = dockerfile.match(/^ARG NODE_VERSION=(\d+\.\d+\.\d+)$/m)?.[1];
if (!pinned) throw new Error('Missing pinned Node.js version');
const major = pinned.split('.')[0];
async function json(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}
const [releases, schedule] = await Promise.all([
  json('https://nodejs.org/dist/index.json'),
  json('https://raw.githubusercontent.com/nodejs/Release/main/schedule.json')
]);
const support = schedule[`v${major}`];
if (!support?.end || new Date(`${support.end}T23:59:59Z`) < new Date()) {
  throw new Error(`Node.js ${major} is unsupported or has no verified support schedule`);
}
const parts = version => version.replace(/^v/, '').split('.').map(Number);
const newer = (a, b) => {
  const av = parts(a), bv = parts(b);
  for (let i = 0; i < 3; i++) if (av[i] !== bv[i]) return av[i] > bv[i];
  return false;
};
if (!releases.some(r => r.version === `v${pinned}`)) throw new Error('Pinned release not published');
const missing = releases.filter(r => r.version.startsWith(`v${major}.`) && r.security && newer(r.version, pinned));
if (missing.length) throw new Error(`Security update required: ${missing.map(r => r.version).join(', ')}`);
console.log(`Node.js ${pinned}: supported; no newer security release in this major`);
