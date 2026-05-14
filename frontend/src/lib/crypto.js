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

let signalReady = null

function getSubtle() {
  return window.crypto.subtle
}

async function ensureSignalReady() {
  if (!signalReady) {
    signalReady = initSignal().then(() => {
      setWebCrypto(window.crypto)
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
  const legacy = parseLegacyPayload(encryptedPayload)
  if (legacy !== null) return legacy

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

export async function generateGroupKey() {
  const key = await getSubtle().generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
  const raw = await getSubtle().exportKey('raw', key)
  return buf2b64(raw)
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
  const legacy = parseLegacyPayload(encryptedPayload)
  if (legacy !== null) return legacy

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
