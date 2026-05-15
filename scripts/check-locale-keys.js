const fs = require('fs');
const path = require('path');

const localeDir = path.resolve(__dirname, '../src/locale');
const baseFile = path.join(localeDir, 'en-US.json');
const base = JSON.parse(fs.readFileSync(baseFile, 'utf8'));
const baseKeys = Object.keys(base).sort();
const localeFiles = fs.readdirSync(localeDir).filter((item) => item.endsWith('.json'));

let hasError = false;

for (const file of localeFiles) {
  const fullPath = path.join(localeDir, file);
  const current = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  const currentKeys = Object.keys(current).sort();
  const missing = baseKeys.filter((key) => !currentKeys.includes(key));
  const extra = currentKeys.filter((key) => !baseKeys.includes(key));
  if (missing.length === 0 && extra.length === 0) {
    continue;
  }
  hasError = true;
  console.error(`[locale-check] ${file}`);
  if (missing.length > 0) {
    console.error(`  missing: ${missing.join(', ')}`);
  }
  if (extra.length > 0) {
    console.error(`  extra: ${extra.join(', ')}`);
  }
}

if (hasError) {
  process.exit(1);
}

console.log('[locale-check] all locale keys are consistent');
