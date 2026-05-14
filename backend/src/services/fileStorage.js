const {
    CreateBucketCommand,
    DeleteObjectCommand,
    GetObjectCommand,
    HeadBucketCommand,
    PutObjectCommand,
    S3Client,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const STORAGE_TYPE = process.env.STORAGE_TYPE || 'local';
const LOCAL_DIR = process.env.LOCAL_STORAGE_DIR || '/app/storage';

let s3Client;
if (STORAGE_TYPE === 's3' || STORAGE_TYPE === 'minio') {
    s3Client = new S3Client({
        endpoint: process.env.S3_ENDPOINT,
        region: process.env.S3_REGION || 'us-east-1',
        credentials: {
            accessKeyId: process.env.S3_ACCESS_KEY,
            secretAccessKey: process.env.S3_SECRET_KEY,
        },
        forcePathStyle: STORAGE_TYPE === 'minio',
    });
}

const BUCKET = process.env.S3_BUCKET || 'windchat-files';
let bucketReadyPromise = null;

function contentDispositionFor(originalName) {
    const fallback = path.basename(originalName || 'download')
        .replace(/[^\x20-\x7E]/g, '_')
        .replace(/["\\]/g, '_') || 'download';
    const encoded = encodeURIComponent(path.basename(originalName || 'download'));
    return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

async function ensureBucket() {
    if (STORAGE_TYPE !== 's3' && STORAGE_TYPE !== 'minio') return;
    if (bucketReadyPromise) return bucketReadyPromise;

    bucketReadyPromise = (async () => {
        try {
            await s3Client.send(new HeadBucketCommand({ Bucket: BUCKET }));
        } catch (err) {
            const statusCode = err?.$metadata?.httpStatusCode;
            const canCreate = STORAGE_TYPE === 'minio' || statusCode === 404;
            if (!canCreate) throw err;

            try {
                await s3Client.send(new CreateBucketCommand({ Bucket: BUCKET }));
            } catch (createErr) {
                const alreadyOwned = createErr?.name === 'BucketAlreadyOwnedByYou' || createErr?.name === 'BucketAlreadyExists';
                if (!alreadyOwned) throw createErr;
            }
        }
    })();

    return bucketReadyPromise;
}

async function uploadFile(buffer, originalName, mimeType) {
    const ext = path.extname(originalName);
    const key = `${uuidv4()}${ext}`;

    if (STORAGE_TYPE === 'local') {
        if (!fs.existsSync(LOCAL_DIR)) fs.mkdirSync(LOCAL_DIR, { recursive: true });
        fs.writeFileSync(path.join(LOCAL_DIR, key), buffer);
        return key;
    }

    await ensureBucket();
    await s3Client.send(new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
        ContentDisposition: contentDispositionFor(originalName),
    }));
    return key;
}

async function getFileUrl(key, expiresIn = 3600) {
    if (STORAGE_TYPE === 'local') {
        return `/api/files/${key}`;
    }
    await ensureBucket();
    const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: key });
    return getSignedUrl(s3Client, cmd, { expiresIn });
}

async function getFileObject(key) {
    if (STORAGE_TYPE === 'local') {
        return null;
    }
    await ensureBucket();
    const result = await s3Client.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    return {
        body: result.Body,
        contentType: result.ContentType,
        contentLength: result.ContentLength,
        contentDisposition: result.ContentDisposition,
    };
}

async function deleteFile(key) {
    if (STORAGE_TYPE === 'local') {
        const fullPath = path.join(LOCAL_DIR, key);
        if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
        return;
    }
    await ensureBucket();
    await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

function getLocalFilePath(key) {
    return path.join(LOCAL_DIR, key);
}

module.exports = { uploadFile, getFileUrl, getFileObject, deleteFile, getLocalFilePath, ensureBucket, STORAGE_TYPE };
