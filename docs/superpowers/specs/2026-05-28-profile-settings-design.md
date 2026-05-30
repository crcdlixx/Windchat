# Profile Settings and Avatar Design

## Goal

Add editable personal profile settings to WindChat. A signed-in user can update their display name and avatar from the existing profile modal. Avatar setup supports both an external image URL and a local image upload.

## Existing Context

- The `users` table already has `display_name` and `avatar_url`.
- `PATCH /users/me` already updates `display_name` and `avatar_url`.
- Docker Compose runs backend, frontend, nginx, and PostgreSQL. The backend can use local storage by default, or S3/MinIO through the existing file storage service.
- Existing attachment download routes check message access, so they are not suitable for public avatar display.

## Backend Design

Keep `users.avatar_url` as the single stored avatar reference.

Enhance `PATCH /users/me` validation:
- `display_name`: trim input, allow empty value to clear, max 64 characters.
- `avatar_url`: trim input, allow empty value to clear, require either `http://`, `https://`, or the internal avatar path prefix.
- Return the full profile shape used by `GET /users/me`, so the client store can update without a second request.

Add an authenticated avatar upload endpoint:
- `POST /users/me/avatar`
- Accept multipart field `avatar`.
- Allow image MIME types only: PNG, JPEG, GIF, WebP.
- Use a small size limit, initially 2 MB.
- Store through the existing `fileStorage.uploadFile` so Docker `local`, `minio`, and `s3` modes remain compatible.
- Save `/api/users/avatar/<key>` to `users.avatar_url`.
- Return the updated full profile.

Add a public avatar read endpoint:
- `GET /users/avatar/:key`
- Validate the key with the same basename rule used by file downloads.
- For `local`, stream from the local storage volume.
- For S3/MinIO, stream through `getFileObject`.
- Set a content type when known and a conservative cache header.

## Frontend Design

Extend `ProfileModal.jsx` with a profile settings section above password, email, and TOTP:
- Show current avatar preview with image fallback to initials.
- Input for display name.
- Input for avatar URL.
- File picker for local avatar upload.
- Buttons for upload, save profile, and clear avatar.
- On success, update `useAuthStore.user` with the returned profile.

Add a small reusable avatar component if it reduces duplication:
- Accept `src`, `name`, and size classes.
- Render `<img>` when `src` exists.
- Fall back to the first character of display name or username.
- Hide failed image loads and fall back cleanly.

Use the avatar in:
- Sidebar current-user footer.
- Profile modal preview.
- New chat user search results.
- Group member and invite rows.
- Message bubbles.

## Data Flow

External URL flow:
1. User edits display name and/or avatar URL.
2. Frontend calls `PATCH /users/me`.
3. Backend validates and saves values.
4. Frontend updates auth store and visible avatar/name refreshes immediately.

Upload flow:
1. User selects an image.
2. Frontend posts multipart data to `POST /users/me/avatar`.
3. Backend validates, stores, saves internal avatar URL, and returns full profile.
4. Frontend updates auth store and preview.

## Error Handling

- Invalid display name returns HTTP 400.
- Invalid URL returns HTTP 400.
- Non-image avatar upload returns HTTP 400.
- Oversized avatar upload returns HTTP 413.
- Storage failures return HTTP 500 and are logged server-side.
- Frontend shows inline success/error messages in the profile section.

## Testing and Verification

Because this repository currently has no formal test runner, verification will use focused checks:
- Add backend route/helper tests only if a local test framework exists before implementation; otherwise use `node --check` on backend source files.
- Run frontend build: `npm run build` in `frontend`.
- Run backend syntax checks across changed backend JavaScript files.
- For Docker validation, use `docker compose build backend frontend` or `docker compose up -d --build` when dependencies and local Docker state permit.

## Out of Scope

- Cropping, resizing, or image editing.
- Per-user private avatars.
- Deleting old uploaded avatar objects.
- Database schema changes.
