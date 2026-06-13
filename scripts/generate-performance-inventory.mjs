import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const outputPath = 'docs/performance/performance-commit-inventory.csv';
const recordSeparator = '\x1e';
const fieldSeparator = '\x1f';

const performancePattern =
  /\b(perf|performance|optimi[sz]|faster|speedup|cache|instanc|defer|lazy|prune|hoist|buffer|typedarray|render loop|reduced motion|postprocessing)\b/i;
const quantitativePattern =
  /(?:\d+(?:\.\d+)?\s*(?:%|x\b|ms\b|kb\b|kib\b)|O\([^)]+\))/i;

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' });
}

function csv(value) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return `"${text.replaceAll('"', '""')}"`;
}

function classify(subject, body, files) {
  const headline = `${subject} ${body}`.toLowerCase();
  const text = `${headline} ${files.join(' ')}`.toLowerCase();
  if (headline.includes('diagram')) return 'diagram';
  if (headline.includes('bundle') || headline.includes('lazy') || headline.includes('startup')) return 'startup';
  if (headline.includes('gpu') || headline.includes('updaterange')) return 'gpu';
  if (headline.includes('geometry') || headline.includes('snowflake generation') || headline.includes('symmetry')) return 'generation';
  if (headline.includes('animation') || headline.includes('render loop') || headline.includes('frame')) return 'animation';
  if (headline.includes('particle') || headline.includes('snowfall')) return 'particles';
  if (headline.includes('mobile') || headline.includes('responsive')) return 'mobile';
  if (text.includes('geometry')) return 'generation';
  if (text.includes('scene.ts')) return 'animation';
  return 'cross-cutting';
}

const log = git(
  'log',
  'main',
  '--no-merges',
  '--date=short',
  `--format=%H${fieldSeparator}%h${fieldSeparator}%ad${fieldSeparator}%s${fieldSeparator}%b${recordSeparator}`,
);

const rows = [];
for (const rawRecord of log.split(recordSeparator)) {
  const record = rawRecord.trim();
  if (!record) continue;

  const [fullSha, shortSha, date, subject, body = ''] = record.split(fieldSeparator);
  if (!performancePattern.test(`${subject}\n${body}`)) continue;

  const files = git('diff-tree', '--no-commit-id', '--name-only', '-r', fullSha)
    .trim()
    .split('\n')
    .filter(Boolean);
  const claims = `${subject}\n${body}`.split('\n')
    .map((line) => line.trim())
    .filter((line) => quantitativePattern.test(line))
    .join(' | ');

  rows.push({
    date,
    shortSha,
    fullSha,
    area: classify(subject, body, files),
    subject,
    files: files.join(' | '),
    quantitativeClaims: claims,
  });
}

rows.sort((a, b) => a.date.localeCompare(b.date) || a.shortSha.localeCompare(b.shortSha));

const header = [
  'date',
  'commit',
  'full_commit',
  'area',
  'subject',
  'changed_files',
  'quantitative_claims',
];
const csvText = [
  header.map(csv).join(','),
  ...rows.map((row) =>
    [
      row.date,
      row.shortSha,
      row.fullSha,
      row.area,
      row.subject,
      row.files,
      row.quantitativeClaims,
    ].map(csv).join(',')
  ),
].join('\n') + '\n';

mkdirSync('docs/performance', { recursive: true });
writeFileSync(outputPath, csvText);
console.log(`Wrote ${rows.length} performance-related commits to ${outputPath}`);
