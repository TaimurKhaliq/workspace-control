import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'

export interface EncodedImageDataUrl {
  dataUrl: string
  mimeType: string
  bytes: number
}

export type ImageEncodingResult =
  | { ok: true; image: EncodedImageDataUrl }
  | { ok: false; reason: string }

const mimeByExtension: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp'
}

export async function encodeImageAsDataUrl(filePath: string, options: { maxBytes?: number } = {}): Promise<ImageEncodingResult> {
  if (!filePath.trim()) return { ok: false, reason: 'screenshot_path_missing' }
  const extension = path.extname(filePath).toLowerCase()
  const mimeType = mimeByExtension[extension]
  if (!mimeType) return { ok: false, reason: `unsupported_image_type:${extension || 'unknown'}` }
  let fileStat
  try {
    fileStat = await stat(filePath)
  } catch {
    return { ok: false, reason: 'screenshot_file_missing' }
  }
  if (!fileStat.isFile()) return { ok: false, reason: 'screenshot_path_not_file' }
  const maxBytes = options.maxBytes ?? 5 * 1024 * 1024
  if (fileStat.size > maxBytes) return { ok: false, reason: 'image_too_large' }
  try {
    const buffer = await readFile(filePath)
    return {
      ok: true,
      image: {
        dataUrl: `data:${mimeType};base64,${buffer.toString('base64')}`,
        mimeType,
        bytes: buffer.byteLength
      }
    }
  } catch {
    return { ok: false, reason: 'screenshot_file_unreadable' }
  }
}
