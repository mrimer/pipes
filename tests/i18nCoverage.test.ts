import fs from 'fs';
import path from 'path';
import { en } from '../src/i18n/en';

const SRC_ROOT = path.resolve(__dirname, '../src');
const T_CALL_REGEX = /\bt\(\s*['"`]([^'"`]+)['"`]/g;
const UNUSED_KEY_ALLOWLIST: RegExp[] = [
  /^settings\.commands\.action\./,
];

function walkTsFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkTsFiles(full));
      continue;
    }
    if (entry.isFile() && full.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

describe('i18n catalog coverage', () => {
  it('all t() keys are defined in en.ts', () => {
    const files = walkTsFiles(SRC_ROOT);
    const missing: string[] = [];
    for (const file of files) {
      const source = fs.readFileSync(file, 'utf8');
      let match: RegExpExecArray | null;
      while ((match = T_CALL_REGEX.exec(source)) !== null) {
        const key = match[1];
        if (key.includes('${')) continue;
        if (!(key in en)) {
          missing.push(`${path.relative(SRC_ROOT, file)}: ${key}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('no unused keys in en.ts', () => {
    const files = walkTsFiles(SRC_ROOT);
    const sources = files.map((file) => fs.readFileSync(file, 'utf8'));
    const sourceBlob = sources.join('\n');

    const unused = Object.keys(en).filter((key) => {
      if (UNUSED_KEY_ALLOWLIST.some((rx) => rx.test(key))) return false;
      return !sourceBlob.includes(`'${key}'`)
        && !sourceBlob.includes(`"${key}"`)
        && !sourceBlob.includes(`\`${key}\``);
    });

    expect(unused).toEqual([]);
  });
});
