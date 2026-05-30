const AVATAR_PREFIX = '/api/users/avatar/';

function normalizeDisplayName(value) {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (typeof value !== 'string') throw new Error('Invalid display_name');

    const trimmed = value.trim();
    if (trimmed.length > 64) throw new Error('Invalid display_name');
    return trimmed || null;
}

function normalizeAvatarUrl(value) {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (typeof value !== 'string') throw new Error('Invalid avatar_url');

    const trimmed = value.trim();
    if (!trimmed) return null;
    if (
        trimmed.startsWith(AVATAR_PREFIX) ||
        trimmed.startsWith('http://') ||
        trimmed.startsWith('https://')
    ) {
        return trimmed;
    }
    throw new Error('Invalid avatar_url');
}

module.exports = {
    AVATAR_PREFIX,
    normalizeAvatarUrl,
    normalizeDisplayName,
};
