// Trivy の全指摘を表示し、Debian 修正版のある High/Critical で失敗させる。
const fs = require('node:fs');

if (process.argv.length !== 3) throw new Error('Usage: node check-image-security.cjs <trivy.json>');
const report = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (!Array.isArray(report.Results) || !report.Results.some(r => r.Type === 'debian')) {
  throw new Error('Missing Debian package scan results');
}
const findings = report.Results.flatMap(r => r.Vulnerabilities || [])
  .filter(v => ['HIGH', 'CRITICAL'].includes(v.Severity));
const fixable = findings.filter(v => v.FixedVersion);
const critical = findings.filter(v => v.Severity === 'CRITICAL');
const ids = [...new Set(findings.map(v => v.VulnerabilityID))].sort();
const summary = [
  '## Container vulnerability scan',
  '',
  `High/Critical package findings: ${findings.length}; Critical: ${critical.length}; fixable: ${fixable.length}.`,
  '',
  'Unfixed findings remain visible; passing this gate does not mean zero vulnerabilities.',
  '',
  ...critical.map(v => `Critical: ${v.VulnerabilityID} (${v.PkgName} ${v.InstalledVersion}; fixed: ${v.FixedVersion || 'not provided'})`),
  ...fixable.map(v => `Update required: ${v.VulnerabilityID} (${v.PkgName}: ${v.InstalledVersion} -> ${v.FixedVersion})`),
  '',
  `CVE IDs: ${ids.join(', ') || 'none'}`,
  ''
].join('\n');
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
if (fixable.length) process.exitCode = 1;
