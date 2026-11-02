// Gera assets/github-stats.svg e assets/top-langs.svg a partir da API do GitHub.
// Nao fica "ao vivo": roda sob demanda (node scripts/generate-stats.js) e os
// SVGs gerados vao commitados no repo. Reexecute pra atualizar os numeros.
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const USERNAME = 'DiegoCard117';
const TOKEN = execSync('gh auth token').toString().trim();

const LANG_COLORS = {
  Python: '#3572A5',
  JavaScript: '#f1e05a',
  TypeScript: '#3178c6',
  HTML: '#e34c26',
  CSS: '#563d7c',
  SCSS: '#c6538c',
  Shell: '#89e051',
  Dockerfile: '#384d54',
  'Jupyter Notebook': '#DA5B0B',
  Java: '#b07219',
  PLpgSQL: '#336790',
  Vue: '#41b883',
};
const FALLBACK_COLOR = '#8b949e';

async function gh(path) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
    },
  });
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${await res.text()}`);
  return res.json();
}

// /user/repos (autenticado) inclui privados, ao contrario de /users/:user/repos.
// So agregamos numeros (contagem, % de linguagem) — nenhum nome de repo privado
// aparece no SVG final.
async function fetchAllRepos() {
  const repos = [];
  for (let page = 1; ; page++) {
    const batch = await gh(`/user/repos?per_page=100&page=${page}&affiliation=owner`);
    repos.push(...batch);
    if (batch.length < 100) break;
  }
  return repos;
}

function escapeXml(s) {
  return String(s).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
}

function statsSvg({ repos, stars, followers, since }) {
  const rows = [
    ['Repositorios (pub. + priv.)', repos],
    ['Estrelas recebidas', stars],
    ['Seguidores', followers],
    ['No GitHub desde', since],
  ];
  const rowHeight = 34;
  const top = 58;
  const height = top + rows.length * rowHeight + 20;

  const rowsSvg = rows.map(([label, value], i) => `
    <text x="24" y="${top + i * rowHeight}" class="label">${escapeXml(label)}</text>
    <text x="356" y="${top + i * rowHeight}" class="value" text-anchor="end">${escapeXml(value)}</text>`).join('');

  return `<svg width="380" height="${height}" viewBox="0 0 380 ${height}" xmlns="http://www.w3.org/2000/svg">
  <style>
    .card { fill: #0d1117; stroke: #30363d; stroke-width: 1; }
    .title { font: 600 15px -apple-system, Segoe UI, sans-serif; fill: #e6edf3; }
    .label { font: 13px -apple-system, Segoe UI, sans-serif; fill: #8b949e; }
    .value { font: 600 13px -apple-system, Segoe UI, sans-serif; fill: #00c897; }
  </style>
  <rect class="card" x="0.5" y="0.5" width="379" height="${height - 1}" rx="10"/>
  <text x="24" y="30" class="title">GitHub Stats</text>
  ${rowsSvg}
</svg>`;
}

function topLangsSvg(langBytes) {
  const total = Object.values(langBytes).reduce((a, b) => a + b, 0);
  const top = Object.entries(langBytes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, bytes]) => ({ name, pct: (bytes / total) * 100 }));

  const barY = 46;
  const barHeight = 10;
  const barWidth = 332;
  let x = 24;
  const segments = top.map(({ name, pct }) => {
    const w = (pct / 100) * barWidth;
    const color = LANG_COLORS[name] ?? FALLBACK_COLOR;
    const seg = `<rect x="${x.toFixed(1)}" y="${barY}" width="${w.toFixed(1)}" height="${barHeight}" fill="${color}"/>`;
    x += w;
    return seg;
  }).join('');

  const legendRows = top.map(({ name, pct }, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const lx = 24 + col * 180;
    const ly = 92 + row * 26;
    const color = LANG_COLORS[name] ?? FALLBACK_COLOR;
    return `
    <circle cx="${lx}" cy="${ly - 4}" r="5" fill="${color}"/>
    <text x="${lx + 12}" y="${ly}" class="label">${escapeXml(name)} ${pct.toFixed(1)}%</text>`;
  }).join('');

  const height = 92 + Math.ceil(top.length / 2) * 26 + 10;

  return `<svg width="380" height="${height}" viewBox="0 0 380 ${height}" xmlns="http://www.w3.org/2000/svg">
  <style>
    .card { fill: #0d1117; stroke: #30363d; stroke-width: 1; }
    .title { font: 600 15px -apple-system, Segoe UI, sans-serif; fill: #e6edf3; }
    .label { font: 12px -apple-system, Segoe UI, sans-serif; fill: #c9d1d9; }
  </style>
  <rect class="card" x="0.5" y="0.5" width="379" height="${height - 1}" rx="10"/>
  <text x="24" y="30" class="title">Top Linguagens</text>
  <rect x="24" y="${barY}" width="${barWidth}" height="${barHeight}" rx="5" fill="#21262d"/>
  ${segments}
  ${legendRows}
</svg>`;
}

const user = await gh(`/users/${USERNAME}`);
const repos = await fetchAllRepos();
const owned = repos.filter((r) => !r.fork);

const stars = owned.reduce((sum, r) => sum + r.stargazers_count, 0);
const since = new Date(user.created_at).getFullYear();

const langBytes = {};
for (const repo of owned) {
  const langs = await gh(`/repos/${USERNAME}/${repo.name}/languages`);
  for (const [name, bytes] of Object.entries(langs)) {
    langBytes[name] = (langBytes[name] ?? 0) + bytes;
  }
}

writeFileSync('assets/github-stats.svg', statsSvg({
  repos: owned.length,
  stars,
  followers: user.followers,
  since,
}));
writeFileSync('assets/top-langs.svg', topLangsSvg(langBytes));

console.log('OK: assets/github-stats.svg e assets/top-langs.svg atualizados.');
