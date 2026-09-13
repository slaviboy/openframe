/*
 * Copyright (C) 2026 Stanislav Georgiev
 * https://github.com/slaviboy
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { sha256Hex } from '@/core/image/hash';
import { capImageSize } from '@/core/image/image-fit';
import type { ImageAsset } from '@/editor/images/image-registry';

/** Formats the renderer decodes directly; anything else the browser can decode is stored as PNG. */
const STORED_AS_IS = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

export const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/heic,image/avif,image/bmp';

export class ImageImportError extends Error {
  override name = 'ImageImportError';
}

/** Layer name for an imported file: its name without the extension. */
export const imageLayerName = (fileName: string): string => fileName.replace(/\.[^.]+$/, '') || 'Image';

/**
 * Reads an image file into an asset: decodes it to learn its size, scales it down to at most
 * 4096px on the longest side (re-encoding as PNG), and hashes the stored bytes.
 * SVG files are not images (they will import as vectors).
 */
export async function readImageFile(file: File): Promise<ImageAsset> {
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') {
    throw new ImageImportError(`${file.name} is not a supported image file.`);
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new ImageImportError(`${file.name} could not be read as an image.`);
  }
  const size = capImageSize(bitmap.width, bitmap.height);
  let blob: Blob = file;
  let mime = file.type;
  if (size.width !== bitmap.width || size.height !== bitmap.height || !STORED_AS_IS.has(file.type)) {
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, size.width, size.height);
    blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new ImageImportError(`${file.name} could not be converted.`))), 'image/png'),
    );
    mime = 'image/png';
  }
  bitmap.close();
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return { hash: await sha256Hex(bytes), bytes, mime, width: size.width, height: size.height };
}

/** Image files in a DataTransfer (drop or paste), in order. */
export const imageFilesOf = (data: DataTransfer | null): File[] =>
  data ? Array.from(data.files).filter((f) => f.type.startsWith('image/') && f.type !== 'image/svg+xml') : [];
