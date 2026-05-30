const test = require('node:test');
const assert = require('node:assert/strict');
const {
    AVATAR_PREFIX,
    normalizeAvatarUrl,
    normalizeDisplayName,
} = require('./profileValidation');

test('normalizeDisplayName trims names and clears blank input', () => {
    assert.equal(normalizeDisplayName('  Alice  '), 'Alice');
    assert.equal(normalizeDisplayName('   '), null);
    assert.equal(normalizeDisplayName(null), null);
    assert.equal(normalizeDisplayName(undefined), undefined);
});

test('normalizeDisplayName rejects non-string and overlong names', () => {
    assert.throws(() => normalizeDisplayName(42), /Invalid display_name/);
    assert.throws(() => normalizeDisplayName('a'.repeat(65)), /Invalid display_name/);
});

test('normalizeAvatarUrl accepts http, https, internal avatar urls, and blank clears', () => {
    assert.equal(normalizeAvatarUrl(' https://example.com/a.png '), 'https://example.com/a.png');
    assert.equal(normalizeAvatarUrl('http://example.com/a.png'), 'http://example.com/a.png');
    assert.equal(normalizeAvatarUrl(`${AVATAR_PREFIX}abc.png`), `${AVATAR_PREFIX}abc.png`);
    assert.equal(normalizeAvatarUrl(''), null);
    assert.equal(normalizeAvatarUrl(null), null);
    assert.equal(normalizeAvatarUrl(undefined), undefined);
});

test('normalizeAvatarUrl rejects unsupported schemes and non-string input', () => {
    assert.throws(() => normalizeAvatarUrl('javascript:alert(1)'), /Invalid avatar_url/);
    assert.throws(() => normalizeAvatarUrl('/api/files/private.png'), /Invalid avatar_url/);
    assert.throws(() => normalizeAvatarUrl(42), /Invalid avatar_url/);
});
