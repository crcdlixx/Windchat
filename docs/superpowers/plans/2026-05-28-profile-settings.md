# Profile Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add editable personal profile settings with display name, avatar URL, and local avatar upload.

**Architecture:** Keep `users.avatar_url` as the single profile image reference. Add an authenticated upload endpoint and a public avatar streaming endpoint under `users`, then update the React profile modal and shared avatar rendering points.

**Tech Stack:** Node.js 20, Express, multer, PostgreSQL, existing `fileStorage` service, React 18, Zustand, Axios, Tailwind CSS, Docker Compose.

---

## File Structure

- Modify `backend/src/routes/users.js`: profile validation, upload endpoint, public avatar endpoint.
- Modify `frontend/src/stores/authStore.js`: add `updateProfile` helper to update auth store from returned profile data.
- Create `frontend/src/components/Avatar.jsx`: reusable avatar display with image fallback.
- Modify `frontend/src/components/ProfileModal.jsx`: add profile settings form with URL, upload, clear, and preview.
- Modify `frontend/src/components/Sidebar.jsx`: display current user avatar.
- Modify `frontend/src/components/NewChatModal.jsx`: display searched user avatars.
- Modify `frontend/src/components/GroupSettingsModal.jsx`: display member and invite avatars.
- Modify `frontend/src/components/MessageBubble.jsx`: display sender avatars.
- Modify `backend/src/routes/messages.js`: include sender `avatar_url` in message queries.
- Modify `backend/src/routes/conversations.js`: already selects partner avatar; verify frontend uses it.

---

### Task 1: Backend Profile Validation and Avatar Routes

**Files:**
- Modify: `backend/src/routes/users.js`

- [ ] **Step 1: Add imports and upload middleware**

Add these imports near the top of `backend/src/routes/users.js`:

```js
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { uploadFile, getFileObject, getLocalFilePath, STORAGE_TYPE } = require('../services/fileStorage');
const logger = require('../utils/logger');
```

Keep existing imports for `express`, `bcrypt`, `pool`, and `authenticateToken`.

Add these constants and helpers after `const router = express.Router();`:

```js
const AVATAR_PREFIX = '/api/users/avatar/';
const AVATAR_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const avatarUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 2 * 1024 * 1024 },
});

function uploadAvatar(req, res, next) {
    avatarUpload.single('avatar')(req, res, (err) => {
        if (!err) return next();
        if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({ error: 'Avatar image is too large' });
        }
        logger.error('Avatar upload parsing failed', err);
        return res.status(400).json({ error: 'Invalid avatar upload' });
    });
}

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

function validateAvatarKey(req, res, next) {
    if (!req.params.key || req.params.key !== path.basename(req.params.key)) {
        return res.status(400).json({ error: 'Invalid avatar key' });
    }
    next();
}

async function getProfile(userId) {
    const result = await pool.query(
        'SELECT id, username, display_name, avatar_url, role, created_at, last_seen, email, email_verified, totp_enabled FROM users WHERE id=$1',
        [userId]
    );
    return result.rows[0] || null;
}
```

- [ ] **Step 2: Reuse `getProfile` in `GET /me`**

Replace the existing `router.get('/me', ...)` body with:

```js
router.get('/me', authenticateToken, async (req, res) => {
    const profile = await getProfile(req.user.id);
    if (!profile) return res.status(404).json({ error: 'User not found' });
    res.json(profile);
});
```

- [ ] **Step 3: Update `PATCH /me` validation and response**

Replace the existing `router.patch('/me', ...)` route with:

```js
router.patch('/me', authenticateToken, async (req, res) => {
    let displayName;
    let avatarUrl;
    try {
        displayName = normalizeDisplayName(req.body.display_name);
        avatarUrl = normalizeAvatarUrl(req.body.avatar_url);
    } catch (err) {
        return res.status(400).json({ error: err.message });
    }

    const fields = [];
    const values = [];
    let idx = 1;

    if (displayName !== undefined) {
        fields.push(`display_name=$${idx++}`);
        values.push(displayName);
    }
    if (avatarUrl !== undefined) {
        fields.push(`avatar_url=$${idx++}`);
        values.push(avatarUrl);
    }

    if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });
    values.push(req.user.id);

    await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE id=$${idx}`, values);

    const profile = await getProfile(req.user.id);
    if (!profile) return res.status(404).json({ error: 'User not found' });
    res.json(profile);
});
```

- [ ] **Step 4: Add avatar upload route before `/:id` route**

Insert this route before `router.get('/:id', ...)`:

```js
router.post('/me/avatar', authenticateToken, uploadAvatar, async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No avatar uploaded' });
    if (!AVATAR_MIME_TYPES.has(req.file.mimetype)) {
        return res.status(400).json({ error: 'Avatar must be a PNG, JPEG, GIF, or WebP image' });
    }

    try {
        const key = await uploadFile(req.file.buffer, req.file.originalname || 'avatar', req.file.mimetype);
        const avatarUrl = `${AVATAR_PREFIX}${encodeURIComponent(key)}`;
        await pool.query('UPDATE users SET avatar_url=$1 WHERE id=$2', [avatarUrl, req.user.id]);

        const profile = await getProfile(req.user.id);
        if (!profile) return res.status(404).json({ error: 'User not found' });
        res.json(profile);
    } catch (err) {
        logger.error('Avatar upload failed', err);
        res.status(500).json({ error: 'Avatar upload failed' });
    }
});
```

- [ ] **Step 5: Add public avatar streaming route before `/:id` route**

Insert this route before `router.get('/:id', ...)`:

```js
router.get('/avatar/:key', validateAvatarKey, async (req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=86400');

    if (STORAGE_TYPE === 'local') {
        const filePath = getLocalFilePath(req.params.key);
        if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Avatar not found' });
        return res.sendFile(filePath);
    }

    try {
        const file = await getFileObject(req.params.key);
        if (file.contentType) res.setHeader('Content-Type', file.contentType);
        if (file.contentLength) res.setHeader('Content-Length', file.contentLength);
        file.body.pipe(res);
    } catch (err) {
        logger.error('Failed to stream avatar', err);
        res.status(404).json({ error: 'Avatar not found' });
    }
});
```

- [ ] **Step 6: Run backend syntax check**

Run:

```powershell
node --check backend/src/routes/users.js
```

Expected: exit code 0 and no syntax errors.

---

### Task 2: Backend Message Avatar Data

**Files:**
- Modify: `backend/src/routes/messages.js`

- [ ] **Step 1: Add `sender_avatar` to message queries**

In both message list queries, update the selected sender fields from:

```sql
u.username as sender_username, u.display_name as sender_display_name
```

to:

```sql
u.username as sender_username, u.display_name as sender_display_name, u.avatar_url as sender_avatar
```

- [ ] **Step 2: Run backend syntax check**

Run:

```powershell
node --check backend/src/routes/messages.js
```

Expected: exit code 0 and no syntax errors.

---

### Task 3: Auth Store Profile Update Helper

**Files:**
- Modify: `frontend/src/stores/authStore.js`

- [ ] **Step 1: Add `updateProfile` action**

Add this action near `setUser(user) { set({ user }) },`:

```js
updateProfile(profile) {
  set(state => ({ user: { ...state.user, ...profile } }))
},
```

- [ ] **Step 2: Run frontend build after this task**

Run:

```powershell
npm run build
```

from `frontend`.

Expected: build succeeds. If unrelated existing build errors appear, record them before continuing.

---

### Task 4: Reusable Avatar Component

**Files:**
- Create: `frontend/src/components/Avatar.jsx`

- [ ] **Step 1: Create avatar component**

Create `frontend/src/components/Avatar.jsx` with:

```jsx
import { useState } from 'react'

export default function Avatar({ src, name, className = 'w-8 h-8', textClassName = 'text-sm' }) {
  const [failed, setFailed] = useState(false)
  const initial = (name || '?').trim()[0]?.toUpperCase() || '?'
  const showImage = src && !failed

  return (
    <div className={`${className} rounded-full bg-wind-700 flex items-center justify-center text-wind-200 font-bold shrink-0 overflow-hidden`}>
      {showImage ? (
        <img
          src={src}
          alt={name || 'avatar'}
          className="w-full h-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className={textClassName}>{initial}</span>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Run frontend build after this task**

Run:

```powershell
npm run build
```

from `frontend`.

Expected: build succeeds.

---

### Task 5: Profile Settings UI

**Files:**
- Modify: `frontend/src/components/ProfileModal.jsx`
- Modify: `frontend/src/lib/i18n.js`

- [ ] **Step 1: Update imports**

In `ProfileModal.jsx`, change the first line to:

```js
import { useEffect, useState } from 'react'
```

Change the lucide import to include `Upload`, `UserRound`, and `ImageOff`:

```js
import { X, KeyRound, Mail, Smartphone, Upload, UserRound, ImageOff } from 'lucide-react'
```

Add:

```js
import Avatar from './Avatar'
```

- [ ] **Step 2: Add `ProfileSection` component above `PasswordSection`**

Add:

```jsx
function ProfileSection({ profile, setProfile }) {
  const updateProfile = useAuthStore(s => s.updateProfile)
  const [form, setForm] = useState({ display_name: '', avatar_url: '' })
  const [file, setFile] = useState(null)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    setForm({
      display_name: profile?.display_name || '',
      avatar_url: profile?.avatar_url || '',
    })
  }, [profile?.display_name, profile?.avatar_url])

  const applyProfile = (nextProfile) => {
    setProfile(nextProfile)
    updateProfile(nextProfile)
  }

  const saveProfile = async () => {
    setMsg('')
    setErr('')
    setSaving(true)
    try {
      const res = await api.patch('/users/me', {
        display_name: form.display_name,
        avatar_url: form.avatar_url,
      })
      applyProfile(res.data)
      setMsg(t('profile_saved'))
    } catch (e) {
      setErr(e.response?.data?.error || t('error'))
    }
    setSaving(false)
  }

  const uploadAvatar = async () => {
    if (!file) return
    setMsg('')
    setErr('')
    setUploading(true)
    try {
      const body = new FormData()
      body.append('avatar', file)
      const res = await api.post('/users/me/avatar', body, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      applyProfile(res.data)
      setForm(s => ({ ...s, avatar_url: res.data.avatar_url || '' }))
      setFile(null)
      setMsg(t('avatar_uploaded'))
    } catch (e) {
      setErr(e.response?.data?.error || t('error'))
    }
    setUploading(false)
  }

  const clearAvatar = async () => {
    setForm(s => ({ ...s, avatar_url: '' }))
    setMsg('')
    setErr('')
    try {
      const res = await api.patch('/users/me', {
        display_name: form.display_name,
        avatar_url: '',
      })
      applyProfile(res.data)
      setMsg(t('profile_saved'))
    } catch (e) {
      setErr(e.response?.data?.error || t('error'))
    }
  }

  const displayName = form.display_name || profile?.username || ''

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-wind-300 text-sm font-medium">
        <UserRound size={14} />
        {t('profile_settings')}
      </div>

      <div className="flex items-center gap-3">
        <Avatar src={form.avatar_url} name={displayName} className="w-14 h-14" textClassName="text-lg" />
        <div className="min-w-0">
          <div className="text-wind-100 text-sm font-medium truncate">{displayName || profile?.username}</div>
          <div className="text-wind-500 text-xs truncate">@{profile?.username}</div>
        </div>
      </div>

      <div>
        <label className="text-wind-400 text-xs mb-1 block">{t('display_name_label')}</label>
        <input
          className="w-full bg-wind-800 text-wind-100 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 ring-wind-500"
          value={form.display_name}
          onChange={e => setForm(s => ({ ...s, display_name: e.target.value }))}
          maxLength={64}
        />
      </div>

      <div>
        <label className="text-wind-400 text-xs mb-1 block">{t('avatar_url')}</label>
        <input
          className="w-full bg-wind-800 text-wind-100 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 ring-wind-500"
          value={form.avatar_url}
          onChange={e => setForm(s => ({ ...s, avatar_url: e.target.value }))}
          placeholder="https://example.com/avatar.png"
        />
      </div>

      <div className="flex items-center gap-2">
        <label className="flex-1 flex items-center gap-2 bg-wind-800 hover:bg-wind-700 text-wind-300 rounded-lg px-3 py-2 text-sm cursor-pointer transition-colors min-w-0">
          <Upload size={14} className="shrink-0" />
          <span className="truncate">{file ? file.name : t('choose_avatar')}</span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            className="hidden"
            onChange={e => setFile(e.target.files?.[0] || null)}
          />
        </label>
        <button
          onClick={uploadAvatar}
          disabled={!file || uploading}
          className="bg-wind-600 hover:bg-wind-500 disabled:opacity-40 text-white rounded-lg px-3 py-2 text-sm font-medium transition-colors"
        >
          {uploading ? t('loading') : t('upload')}
        </button>
      </div>

      {err && <div className="text-red-400 text-xs">{err}</div>}
      {msg && <div className="text-green-400 text-xs">{msg}</div>}

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={saveProfile}
          disabled={saving}
          className="bg-wind-600 hover:bg-wind-500 disabled:opacity-40 text-white rounded-lg py-2 text-sm font-medium transition-colors"
        >
          {saving ? t('saving') : t('save_profile')}
        </button>
        <button
          onClick={clearAvatar}
          className="flex items-center justify-center gap-1.5 bg-wind-800 hover:bg-wind-700 text-wind-300 rounded-lg py-2 text-sm font-medium transition-colors"
        >
          <ImageOff size={14} />
          {t('clear_avatar')}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Replace the `useState` side-effect with `useEffect`**

Replace:

```js
  useState(() => {
    api.get('/users/me').then(r => setProfile(r.data)).catch(() => {})
  })
```

with:

```js
  useEffect(() => {
    api.get('/users/me').then(r => setProfile(r.data)).catch(() => {})
  }, [])
```

- [ ] **Step 4: Use Avatar and ProfileSection in modal**

Replace the existing user info block with:

```jsx
          <div className="flex items-center gap-3">
            <Avatar src={display.avatar_url} name={display.display_name || display.username} className="w-12 h-12" textClassName="text-lg" />
            <div className="min-w-0">
              <div className="text-wind-100 font-medium truncate">{display.display_name || display.username}</div>
              <div className="text-wind-500 text-xs truncate">@{display.username} · {display.role}</div>
            </div>
          </div>

          <ProfileSection profile={display} setProfile={setProfile} />
```

- [ ] **Step 5: Add i18n keys**

In both `zh` and `en` dictionaries in `frontend/src/lib/i18n.js`, add keys near the profile section. Use readable Chinese strings in `zh`:

```js
  profile_settings: '设置个人资料',
  display_name_label: '昵称',
  avatar_url: '头像链接',
  choose_avatar: '选择头像图片',
  upload: '上传',
  avatar_uploaded: '头像已上传',
  profile_saved: '个人资料已保存',
  save_profile: '保存资料',
  clear_avatar: '清除头像',
```

For `en`:

```js
  profile_settings: 'Profile Settings',
  display_name_label: 'Display name',
  avatar_url: 'Avatar URL',
  choose_avatar: 'Choose avatar image',
  upload: 'Upload',
  avatar_uploaded: 'Avatar uploaded',
  profile_saved: 'Profile saved',
  save_profile: 'Save Profile',
  clear_avatar: 'Clear Avatar',
```

- [ ] **Step 6: Run frontend build**

Run:

```powershell
npm run build
```

from `frontend`.

Expected: build succeeds.

---

### Task 6: Avatar Display Across UI

**Files:**
- Modify: `frontend/src/components/Sidebar.jsx`
- Modify: `frontend/src/components/NewChatModal.jsx`
- Modify: `frontend/src/components/GroupSettingsModal.jsx`
- Modify: `frontend/src/components/MessageBubble.jsx`

- [ ] **Step 1: Update `Sidebar.jsx`**

Add:

```js
import Avatar from './Avatar'
```

Replace the current user footer avatar button contents with:

```jsx
            <button
              onClick={() => setShowProfile(true)}
              className="rounded-full hover:ring-2 ring-wind-400 transition-all"
              title={t('profile')}
            >
              <Avatar src={user?.avatar_url} name={user?.display_name || user?.username} className="w-7 h-7" textClassName="text-xs" />
            </button>
```

In DM conversation rows, replace the hard-coded partner initial div with:

```jsx
              <Avatar src={conv.partner_avatar} name={conv.partner_display_name || conv.partner_username} className="w-9 h-9" textClassName="text-sm" />
```

- [ ] **Step 2: Update `NewChatModal.jsx`**

Add:

```js
import Avatar from './Avatar'
```

Replace result row avatar div with:

```jsx
                <Avatar src={u.avatar_url} name={u.display_name || u.username} className="w-8 h-8" textClassName="text-sm" />
```

- [ ] **Step 3: Update `GroupSettingsModal.jsx`**

Add:

```js
import Avatar from './Avatar'
```

Replace member row avatar div with:

```jsx
                  <Avatar src={m.avatar_url} name={m.display_name || m.username} className="w-8 h-8" textClassName="text-sm" />
```

Replace invite result avatar div with:

```jsx
                        <Avatar src={u.avatar_url} name={u.display_name || u.username} className="w-8 h-8" textClassName="text-sm" />
```

- [ ] **Step 4: Update `MessageBubble.jsx`**

Add:

```js
import Avatar from './Avatar'
```

Replace the non-own sender initial div with:

```jsx
        <div className="mr-2 mt-1">
          <Avatar src={message.sender_avatar} name={message.sender_display_name || message.sender_username} className="w-7 h-7" textClassName="text-xs" />
        </div>
```

- [ ] **Step 5: Run frontend build**

Run:

```powershell
npm run build
```

from `frontend`.

Expected: build succeeds.

---

### Task 7: Final Verification in Docker-Aware Workflow

**Files:**
- No source edits expected.

- [ ] **Step 1: Backend syntax checks**

Run:

```powershell
Get-ChildItem -Path backend\src -Recurse -Filter *.js | ForEach-Object { node --check $_.FullName }
```

Expected: every file exits without syntax errors.

- [ ] **Step 2: Frontend production build**

Run:

```powershell
npm run build
```

from `frontend`.

Expected: Vite build exits with code 0.

- [ ] **Step 3: Docker build**

Run from repo root:

```powershell
docker compose build backend frontend
```

Expected: backend and frontend images build. If Docker is not running, record the exact Docker error.

- [ ] **Step 4: Review git diff**

Run:

```powershell
git diff --stat
git diff -- backend/src/routes/users.js backend/src/routes/messages.js frontend/src/components/ProfileModal.jsx frontend/src/components/Avatar.jsx frontend/src/stores/authStore.js
```

Expected: changes match the profile settings scope only.
