const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, '..');
const INTEGRITY_FILE = path.join(__dirname, '../../src_integrity.txt');

function hashDirectory(dir) {
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
            hash.update(hashDirectory(full));
        } else if (entry.isFile()) {
            hash.update(entry.name);
            hash.update(fs.readFileSync(full));
        }
    }
    return hash.digest('hex');
}

async function verifyIntegrity() {
    const current = hashDirectory(SRC_DIR);
    let expected = null;
    let valid = false;

    try {
        expected = fs.readFileSync(INTEGRITY_FILE, 'utf8').trim();
        valid = crypto.timingSafeEqual(Buffer.from(current), Buffer.from(expected));
    } catch {
        // In development, integrity file may not exist
        if (process.env.NODE_ENV !== 'production') {
            valid = true;
        }
    }

    return { valid, current, expected };
}

module.exports = { verifyIntegrity, hashDirectory };
