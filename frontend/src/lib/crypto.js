import initSignal, {
  Direction,
  KeyHelper,
  SessionBuilder,
  SessionCipher,
  SignalProtocolAddress,
  setWebCrypto,
} from '@privacyresearch/libsignal-protocol-typescript'

const SIGNAL_DEVICE_ID = 1
const PREKEY_BATCH_SIZE = 25
const GROUP_KEY_PREFIX = 'wc_group_key'
const NOTES_KEY_PREFIX = 'wc_notes_key'
const VAULT_PASSWORD_KEY = 'wc_vault_password'
const VAULT_KDF_ITERATIONS = 250000

let signalReady = null

function getCrypto() {
  const crypto = window.crypto
  if (!crypto?.subtle) {
    throw new Error('web_crypto_unavailable')
  }
  return crypto
}

function getSubtle() {
  return getCrypto().subtle
}

async function ensureSignalReady() {
  if (!signalReady) {
    signalReady = initSignal().then(() => {
      setWebCrypto(getCrypto())
    })
  }
  return signalReady
}

function buf2b64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

function b642buf(b64) {
  const s = b64.replace(/-/g, '+').replace(/_/g, '/')
  const padded = s + '='.repeat((4 - (s.length % 4)) % 4)
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0)).buffer
}

function stringToArrayBuffer(value) {
  return new TextEncoder().encode(value).buffer
}

function arrayBufferToString(value) {
  return new TextDecoder().decode(value)
}

function keyIdFromNow(offset = 0) {
  return Math.floor(Date.now() / 1000) + offset
}

function localKeyName(userId) {
  return `wc_identity_${userId}`
}

function sessionPrefix(userId) {
  return `wc_signal_${userId}`
}

function addressFor(userId) {
  return new SignalProtocolAddress(String(userId), SIGNAL_DEVICE_ID)
}

function normalizeLocalKeys(raw) {
  if (!raw) return null
  if (raw.protocol === 'signal-v1') return raw

  return null
}

function getMyKeys(userId) {
  try {
    const keys = normalizeLocalKeys(JSON.parse(localStorage.getItem(localKeyName(userId)) || 'null'))
    if (keys && !keys.selfKey) {
      keys.selfKey = buf2b64(window.crypto.getRandomValues(new Uint8Array(32)).buffer)
      setMyKeys(userId, keys)
    }
    return keys
  } catch {
    return null
  }
}

function setMyKeys(userId, keys) {
  localStorage.setItem(localKeyName(userId), JSON.stringify(keys))
}

function getJson(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null')
  } catch {
    return null
  }
}

function setJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value))
}

function randomB64(bytes = 32) {
  return buf2b64(window.crypto.getRandomValues(new Uint8Array(bytes)).buffer)
}

function parseJsonMaybe(value) {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function keyPairToJson(keyPair) {
  return {
    pubKey: buf2b64(keyPair.pubKey),
    privKey: buf2b64(keyPair.privKey),
  }
}

function keyPairFromJson(keyPair) {
  if (!keyPair) return undefined
  return {
    pubKey: b642buf(keyPair.pubKey),
    privKey: b642buf(keyPair.privKey),
  }
}

function publicPreKeyToJson(preKey) {
  return {
    key_id: preKey.keyId,
    public_key: buf2b64(preKey.keyPair.pubKey),
  }
}

function signedPreKeyToJson(signedPreKey) {
  return {
    key_id: signedPreKey.keyId,
    public_key: buf2b64(signedPreKey.keyPair.pubKey),
    signature: buf2b64(signedPreKey.signature),
  }
}

function createSignalStore(userId) {
  const prefix = sessionPrefix(userId)
  const storageKey = name => `${prefix}:${name}`

  return {
    async getIdentityKeyPair() {
      return keyPairFromJson(getMyKeys(userId)?.identityKeyPair)
    },

    async getLocalRegistrationId() {
      return getMyKeys(userId)?.registrationId
    },

    async isTrustedIdentity(identifier, identityKey, direction) {
      const saved = getJson(storageKey(`identity:${identifier}`))
      if (!saved) return true

      const incoming = buf2b64(identityKey)
      if (saved.publicKey === incoming) return true

      return direction !== Direction.SENDING
    },

    async saveIdentity(encodedAddress, publicKey) {
      const key = storageKey(`identity:${encodedAddress}`)
      const previous = getJson(key)
      const next = buf2b64(publicKey)
      setJson(key, { publicKey: next })
      return previous?.publicKey !== next
    },

    async loadPreKey(keyId) {
      const keys = getMyKeys(userId)
      return keyPairFromJson(keys?.preKeys?.[String(keyId)])
    },

    async storePreKey(keyId, keyPair) {
      const keys = getMyKeys(userId)
      if (!keys) throw new Error('Missing local Signal identity')
      setMyKeys(userId, {
        ...keys,
        preKeys: {
          ...(keys.preKeys || {}),
          [String(keyId)]: keyPairToJson(keyPair),
        },
      })
    },

    async removePreKey(keyId) {
      const keys = getMyKeys(userId)
      if (!keys) return
      const preKeys = { ...(keys.preKeys || {}) }
      delete preKeys[String(keyId)]
      setMyKeys(userId, { ...keys, preKeys })
    },

    async storeSession(encodedAddress, record) {
      localStorage.setItem(storageKey(`session:${encodedAddress}`), record)
    },

    async loadSession(encodedAddress) {
      return localStorage.getItem(storageKey(`session:${encodedAddress}`)) || undefined
    },

    async loadSignedPreKey(keyId) {
      const keys = getMyKeys(userId)
      if (String(keys?.signedPreKey?.keyId) !== String(keyId)) return undefined
      return keyPairFromJson(keys.signedPreKey.keyPair)
    },

    async storeSignedPreKey(keyId, keyPair) {
      const keys = getMyKeys(userId)
      if (!keys) throw new Error('Missing local Signal identity')
      setMyKeys(userId, {
        ...keys,
        signedPreKey: {
          keyId: Number(keyId),
          keyPair: keyPairToJson(keyPair),
          signature: keys.signedPreKey?.signature,
        },
      })
    },

    async removeSignedPreKey() {
      // Keep the current signed prekey. Removing it would break pending PreKey messages.
    },
  }
}

export async function generateIdentityKeys() {
  await ensureSignalReady()

  const identityKeyPair = await KeyHelper.generateIdentityKeyPair()
  const registrationId = KeyHelper.generateRegistrationId()
  const signedPreKey = await KeyHelper.generateSignedPreKey(identityKeyPair, keyIdFromNow())
  const oneTimePrekeys = await Promise.all(
    Array.from({ length: PREKEY_BATCH_SIZE }, (_, i) => KeyHelper.generatePreKey(keyIdFromNow(i + 1)))
  )

  return { identityKeyPair, registrationId, signedPreKey, oneTimePrekeys }
}

export async function exportKeyBundle(identityKeyPair, registrationId, signedPreKey, oneTimePrekeys) {
  const preKeys = Object.fromEntries(
    oneTimePrekeys.map(preKey => [String(preKey.keyId), keyPairToJson(preKey.keyPair)])
  )

  return {
    identity_key: buf2b64(identityKeyPair.pubKey),
    registration_id: registrationId,
    signed_prekey: {
      ...signedPreKeyToJson(signedPreKey),
      registration_id: registrationId,
    },
    one_time_prekeys: oneTimePrekeys.map(publicPreKeyToJson),
    local_private: {
      protocol: 'signal-v1',
      registrationId,
      identityKeyPair: keyPairToJson(identityKeyPair),
      signedPreKey: {
        keyId: signedPreKey.keyId,
        keyPair: keyPairToJson(signedPreKey.keyPair),
        signature: buf2b64(signedPreKey.signature),
      },
      preKeys,
      selfKey: buf2b64(window.crypto.getRandomValues(new Uint8Array(32)).buffer),
    },
  }
}

export async function createAndStoreSignalIdentity(userId) {
  const keys = await generateIdentityKeys()
  const bundle = await exportKeyBundle(
    keys.identityKeyPair,
    keys.registrationId,
    keys.signedPreKey,
    keys.oneTimePrekeys
  )
  setMyKeys(userId, bundle.local_private)
  return bundle
}

export function hasLocalSignalIdentity(userId) {
  return Boolean(getMyKeys(userId))
}

function mapBundleForSignal(bundle) {
  const signedPreKey = bundle.signed_prekey || bundle.signedPreKey
  const oneTimePrekey = bundle.one_time_prekey || bundle.preKey

  if (!bundle.identity_key || !signedPreKey?.public_key || !signedPreKey?.signature) {
    throw new Error('recipient_signal_keys_outdated')
  }

  return {
    registrationId: bundle.registration_id,
    identityKey: b642buf(bundle.identity_key),
    signedPreKey: {
      keyId: signedPreKey.key_id,
      publicKey: b642buf(signedPreKey.public_key),
      signature: b642buf(signedPreKey.signature),
    },
    preKey: oneTimePrekey ? {
      keyId: oneTimePrekey.key_id,
      publicKey: b642buf(oneTimePrekey.public_key),
    } : undefined,
  }
}

async function getSessionCipher(myUserId, remoteUserId) {
  await ensureSignalReady()
  const store = createSignalStore(myUserId)
  return new SessionCipher(store, addressFor(remoteUserId))
}

export async function hasSignalSession(myUserId, remoteUserId) {
  if (!getMyKeys(myUserId)) return false
  const cipher = await getSessionCipher(myUserId, remoteUserId)
  return cipher.hasOpenSession()
}

async function encryptSelfCopy(myUserId, plaintext) {
  const keys = getMyKeys(myUserId)
  if (!keys?.selfKey) throw new Error('Missing local self-encryption key')

  const key = await getSubtle().importKey('raw', b642buf(keys.selfKey), { name: 'AES-GCM', length: 256 }, false, ['encrypt'])
  const iv = window.crypto.getRandomValues(new Uint8Array(12))
  const ct = await getSubtle().encrypt({ name: 'AES-GCM', iv }, key, stringToArrayBuffer(plaintext))

  return {
    alg: 'AES-GCM',
    ct: buf2b64(ct),
    iv: buf2b64(iv.buffer),
  }
}

async function decryptSelfCopy(myUserId, selfCopy) {
  const keys = getMyKeys(myUserId)
  if (!keys?.selfKey || !selfCopy?.ct || !selfCopy?.iv) return '[Encrypted - no local keys]'

  const key = await getSubtle().importKey('raw', b642buf(keys.selfKey), { name: 'AES-GCM', length: 256 }, false, ['decrypt'])
  const plain = await getSubtle().decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(b642buf(selfCopy.iv)) },
    key,
    b642buf(selfCopy.ct)
  )

  return arrayBufferToString(plain)
}

async function encryptSignalEnvelope(myUserId, recipientBundle, plaintext) {
  if (!getMyKeys(myUserId)) throw new Error('Missing local Signal identity')

  await ensureSignalReady()
  const store = createSignalStore(myUserId)
  const address = addressFor(recipientBundle.user_id)
  const cipher = new SessionCipher(store, address)

  if (!(await cipher.hasOpenSession())) {
    const builder = new SessionBuilder(store, address)
    await builder.processPreKey(mapBundleForSignal(recipientBundle))
  }

  const encrypted = await cipher.encrypt(stringToArrayBuffer(plaintext))

  return {
    type: encrypted.type,
    body: buf2b64(stringToArrayBuffer(encrypted.body || '')),
    registration_id: encrypted.registrationId,
  }
}

export async function encryptMessage(myUserId, recipientBundle, plaintext) {
  const signal = await encryptSignalEnvelope(myUserId, recipientBundle, plaintext)
  const self = await encryptSelfCopy(myUserId, plaintext)

  return JSON.stringify({
    v: 3,
    protocol: 'signal',
    signal,
    self,
  })
}

function parseLegacyPayload(encryptedPayload) {
  try {
    const env = JSON.parse(encryptedPayload)
    if (typeof env.text === 'string') return env.text
    return null
  } catch {
    return encryptedPayload || ''
  }
}

export async function decryptMessage(myUserId, senderUserId, encryptedPayload) {
  try {
    const env = JSON.parse(encryptedPayload)
    if (env.protocol !== 'signal' || env.v !== 3) return '[Encrypted]'
    if (!getMyKeys(myUserId)) return '[Encrypted - no local keys]'
    if (String(myUserId) === String(senderUserId)) return decryptSelfCopy(myUserId, env.self)

    const cipher = await getSessionCipher(myUserId, senderUserId)
    const signal = env.signal || env
    const body = arrayBufferToString(b642buf(signal.body))
    const plain = signal.type === 3
      ? await cipher.decryptPreKeyWhisperMessage(body, 'binary')
      : await cipher.decryptWhisperMessage(body, 'binary')

    return arrayBufferToString(plain)
  } catch {
    return '[Decryption failed]'
  }
}

async function importGroupKey(b64) {
  return getSubtle().importKey('raw', b642buf(b64), { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

function getGroupKey(groupId) {
  return localStorage.getItem(`${GROUP_KEY_PREFIX}_${groupId}`)
}

function setGroupKey(groupId, key) {
  localStorage.setItem(`${GROUP_KEY_PREFIX}_${groupId}`, key)
}

function notesKeyName(userId) {
  return `${NOTES_KEY_PREFIX}_${userId}`
}

function getNotesKey(userId) {
  return localStorage.getItem(notesKeyName(userId))
}

function setNotesKey(userId, key) {
  localStorage.setItem(notesKeyName(userId), key)
}

function listLocalStorage(prefix) {
  const items = {}
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i)
    if (key?.startsWith(prefix)) items[key] = localStorage.getItem(key)
  }
  return items
}

export async function generateGroupKey() {
  const key = await getSubtle().generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
  const raw = await getSubtle().exportKey('raw', key)
  return buf2b64(raw)
}

export function storeGroupKey(groupId, key) {
  if (groupId && key) setGroupKey(groupId, key)
}

export function readGroupKey(groupId) {
  return getGroupKey(groupId)
}

export async function getOrCreateGroupKey(groupId) {
  const existing = getGroupKey(groupId)
  if (existing) return existing

  const key = await generateGroupKey()
  setGroupKey(groupId, key)
  return key
}

export async function encryptGroupMessage(groupId, plaintext) {
  const groupKeyB64 = await getOrCreateGroupKey(groupId)
  const key = await importGroupKey(groupKeyB64)
  const iv = window.crypto.getRandomValues(new Uint8Array(12))
  const ct = await getSubtle().encrypt({ name: 'AES-GCM', iv }, key, stringToArrayBuffer(plaintext))

  return JSON.stringify({
    v: 3,
    protocol: 'windchat-group-aes-gcm',
    ct: buf2b64(ct),
    iv: buf2b64(iv.buffer),
  })
}

export async function decryptGroupMessage(groupId, encryptedPayload) {
  try {
    const env = JSON.parse(encryptedPayload)
    if (env.protocol !== 'windchat-group-aes-gcm') return '[Encrypted]'

    const groupKeyB64 = getGroupKey(groupId)
    if (!groupKeyB64) return '[Encrypted - no local group key]'

    const key = await importGroupKey(groupKeyB64)
    const plain = await getSubtle().decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(b642buf(env.iv)) },
      key,
      b642buf(env.ct)
    )
    return arrayBufferToString(plain)
  } catch {
    return '[Decryption failed]'
  }
}

export async function encryptFile(file) {
  const keyB64 = randomB64(32)
  const iv = window.crypto.getRandomValues(new Uint8Array(12))
  const key = await getSubtle().importKey('raw', b642buf(keyB64), { name: 'AES-GCM', length: 256 }, false, ['encrypt'])
  const ct = await getSubtle().encrypt({ name: 'AES-GCM', iv }, key, await file.arrayBuffer())

  return {
    blob: new Blob([ct], { type: 'application/octet-stream' }),
    meta: {
      v: 1,
      alg: 'AES-GCM',
      key: keyB64,
      iv: buf2b64(iv.buffer),
      name: file.name,
      type: file.type || 'application/octet-stream',
      size: file.size,
    },
  }
}

export async function decryptFileBlob(blob, meta) {
  if (!meta?.key || !meta?.iv) throw new Error('Missing encrypted file metadata')
  const key = await getSubtle().importKey('raw', b642buf(meta.key), { name: 'AES-GCM', length: 256 }, false, ['decrypt'])
  const plain = await getSubtle().decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(b642buf(meta.iv)) },
    key,
    await blob.arrayBuffer()
  )
  return new Blob([plain], { type: meta.type || 'application/octet-stream' })
}

async function encryptWithRawKey(keyB64, plaintext, extra = {}) {
  const key = await getSubtle().importKey('raw', b642buf(keyB64), { name: 'AES-GCM', length: 256 }, false, ['encrypt'])
  const iv = window.crypto.getRandomValues(new Uint8Array(12))
  const ct = await getSubtle().encrypt({ name: 'AES-GCM', iv }, key, stringToArrayBuffer(plaintext))
  return JSON.stringify({
    v: 1,
    alg: 'AES-GCM',
    iv: buf2b64(iv.buffer),
    ct: buf2b64(ct),
    ...extra,
  })
}

async function decryptWithRawKey(keyB64, encryptedPayload) {
  const env = typeof encryptedPayload === 'string' ? JSON.parse(encryptedPayload) : encryptedPayload
  const key = await getSubtle().importKey('raw', b642buf(keyB64), { name: 'AES-GCM', length: 256 }, false, ['decrypt'])
  const plain = await getSubtle().decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(b642buf(env.iv)) },
    key,
    b642buf(env.ct)
  )
  return arrayBufferToString(plain)
}

export async function getOrCreateNotesKey(userId) {
  const existing = getNotesKey(userId)
  if (existing) return existing
  const key = randomB64(32)
  setNotesKey(userId, key)
  return key
}

export async function encryptNotes(userId, content) {
  const key = await getOrCreateNotesKey(userId)
  return encryptWithRawKey(key, content || '', { protocol: 'windchat-notes-aes-gcm' })
}

export async function decryptNotes(userId, encryptedPayload) {
  if (!encryptedPayload) return ''
  const env = parseJsonMaybe(encryptedPayload)
  if (env?.protocol !== 'windchat-notes-aes-gcm') return encryptedPayload
  const key = getNotesKey(userId)
  if (!key) return ''
  return decryptWithRawKey(key, env)
}

export function setVaultPassword(password) {
  if (password) sessionStorage.setItem(VAULT_PASSWORD_KEY, password)
}

export function getVaultPassword() {
  return sessionStorage.getItem(VAULT_PASSWORD_KEY) || ''
}

export function clearVaultPassword() {
  sessionStorage.removeItem(VAULT_PASSWORD_KEY)
}

async function deriveVaultKey(password, salt, userId) {
  const material = await getSubtle().importKey(
    'raw',
    stringToArrayBuffer(`${userId}:${password}`),
    'PBKDF2',
    false,
    ['deriveKey']
  )
  return getSubtle().deriveKey(
    { name: 'PBKDF2', salt: b642buf(salt), iterations: VAULT_KDF_ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

export function createVaultSnapshot(userId) {
  return {
    v: 1,
    identity: localStorage.getItem(localKeyName(userId)),
    signal: listLocalStorage(`${sessionPrefix(userId)}:`),
    groups: listLocalStorage(`${GROUP_KEY_PREFIX}_`),
    notesKey: localStorage.getItem(notesKeyName(userId)),
  }
}

export function restoreVaultSnapshot(userId, snapshot) {
  if (!snapshot || snapshot.v !== 1) return
  if (snapshot.identity) localStorage.setItem(localKeyName(userId), snapshot.identity)
  Object.entries(snapshot.signal || {}).forEach(([key, value]) => {
    if (key.startsWith(`${sessionPrefix(userId)}:`) && typeof value === 'string') localStorage.setItem(key, value)
  })
  Object.entries(snapshot.groups || {}).forEach(([key, value]) => {
    if (key.startsWith(`${GROUP_KEY_PREFIX}_`) && typeof value === 'string') localStorage.setItem(key, value)
  })
  if (snapshot.notesKey) localStorage.setItem(notesKeyName(userId), snapshot.notesKey)
}

export async function encryptVaultSnapshot(userId, password) {
  const salt = randomB64(16)
  const iv = window.crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveVaultKey(password, salt, userId)
  const ct = await getSubtle().encrypt(
    { name: 'AES-GCM', iv },
    key,
    stringToArrayBuffer(JSON.stringify(createVaultSnapshot(userId)))
  )
  return {
    v: 1,
    alg: 'AES-GCM',
    kdf: 'PBKDF2-SHA256',
    iterations: VAULT_KDF_ITERATIONS,
    salt,
    iv: buf2b64(iv.buffer),
    ct: buf2b64(ct),
  }
}

export async function decryptVaultSnapshot(userId, password, vault) {
  if (!vault?.salt || !vault?.iv || !vault?.ct) return null
  const key = await deriveVaultKey(password, vault.salt, userId)
  const plain = await getSubtle().decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(b642buf(vault.iv)) },
    key,
    b642buf(vault.ct)
  )
  return JSON.parse(arrayBufferToString(plain))
}
