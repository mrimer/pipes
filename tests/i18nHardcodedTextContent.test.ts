import fs from 'fs';
import path from 'path';

const SRC_ROOT = path.resolve(__dirname, '../src');
const TEXT_CONTENT_LITERAL_REGEX = /textContent\s*=\s*['"`]([^'"`]+)['"`]/g;
const ALLOWLIST = [
  /src\/i18n\//,
  /src\/i18n\.ts$/,
];

function walkTsFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkTsFiles(full));
    if (entry.isFile() && full.endsWith('.ts')) out.push(full);
  }
  return out;
}

describe('i18n hardcoded textContent warnings', () => {
  it('logs warnings for hardcoded textContent literals', () => {
    const files = walkTsFiles(SRC_ROOT);
    const warnings: string[] = [];
    for (const file of files) {
      if (ALLOWLIST.some((rx) => rx.test(file))) continue;
      const src = fs.readFileSync(file, 'utf8');
      let m: RegExpExecArray | null;
      while ((m = TEXT_CONTENT_LITERAL_REGEX.exec(src)) !== null) {
        const value = m[1].trim();
        if (!value) continue;
        warnings.push(`${path.relative(SRC_ROOT, file)}: ${value}`);
      }
    }

    if (warnings.length > 0) {
      console.warn(`i18n hardcoded textContent warning(s):\n${warnings.join('\n')}`);
    }

    expect(true).toBe(true);
  });
});
