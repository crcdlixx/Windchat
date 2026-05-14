const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function hashDir(dir) {
  const hash = crypto.createHash('sha256');
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return '';
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      hash.update(hashDir(full));
    } else if (entry.isFile()) {
      hash.update(entry.name);
      hash.update(fs.readFileSync(full));
    }
  }
  return hash.digest('hex');
}

const h = hashDir(path.join(__dirname, '../src'));
fs.writeFileSync(path.join(__dirname, '../src_integrity.txt'), h);
console.log('Source integrity hash:', h);
