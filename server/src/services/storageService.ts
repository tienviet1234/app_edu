import { v2 as cloudinary } from 'cloudinary'
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { env } from '../config/env.js'

// ── Cloudinary (ảnh) ────────────────────────────────────────────────────────
cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
})

export async function uploadImageToCloudinary(
  buffer: Buffer,
  folder = 'homework',
): Promise<{ url: string; publicId: string }> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'image',
        transformation: [{ width: 1280, crop: 'limit', quality: 'auto:good', fetch_format: 'webp' }],
      },
      (err, result) => {
        if (err || !result) return reject(err ?? new Error('Cloudinary upload failed'))
        resolve({ url: result.secure_url, publicId: result.public_id })
      },
    )
    stream.end(buffer)
  })
}

export async function deleteImageFromCloudinary(publicId: string): Promise<void> {
  await cloudinary.uploader.destroy(publicId)
}

// ── Cloudflare R2 (video) ────────────────────────────────────────────────────
const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
})

export async function uploadVideoToR2(
  buffer: Buffer,
  key: string,
  mimeType: string,
): Promise<{ key: string }> {
  await r2.send(
    new PutObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    }),
  )
  return { key }
}

export async function deleteVideoFromR2(key: string): Promise<void> {
  await r2.send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: key }))
}

/** Tạo presigned URL xem video, hết hạn sau 1 giờ */
export async function getVideoPresignedUrl(key: string): Promise<string> {
  const command = new GetObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: key })
  return getSignedUrl(r2, command, { expiresIn: 3600 })
}

export function makeVideoKey(submissionId: string, originalName: string): string {
  const ext = originalName.split('.').pop() ?? 'mp4'
  return `videos/${submissionId}.${ext}`
}
