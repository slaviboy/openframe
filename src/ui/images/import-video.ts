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
import { ImageImportError } from './import-image';

/** Video formats a fill takes (MP4 and MOV, WebM), for file pickers. */
export const VIDEO_ACCEPT = 'video/mp4,video/quicktime,video/webm';
const VIDEO_TYPES: ReadonlySet<string> = new Set(['video/mp4', 'video/quicktime', 'video/webm']);

/** The largest video a fill takes: 300 MB. */
export const MAX_VIDEO_BYTES = 300 * 1024 * 1024;

export const isVideoFile = (file: File): boolean => VIDEO_TYPES.has(file.type);

/** A video file read into assets: the video's bytes, and its first frame as a PNG poster (at most 4096px). */
export interface VideoAssets {
  readonly video: ImageAsset;
  readonly poster: ImageAsset;
}

/** Reads a video file: plays it far enough to learn its size and draw its first frame, and hashes both. */
export async function readVideoFile(file: File): Promise<VideoAssets> {
  if (!isVideoFile(file)) throw new ImageImportError(`${file.name} is not a supported video file.`);
  if (file.size > MAX_VIDEO_BYTES) throw new ImageImportError(`${file.name} is larger than 300 MB.`);
  const url = URL.createObjectURL(file);
  try {
    const element = document.createElement('video');
    element.muted = true;
    element.playsInline = true;
    element.preload = 'auto';
    await new Promise<void>((resolve, reject) => {
      element.addEventListener('loadeddata', () => resolve(), { once: true });
      element.addEventListener('error', () => reject(new ImageImportError(`${file.name} can't be played in this browser.`)), { once: true });
      element.src = url;
    });
    const width = element.videoWidth;
    const height = element.videoHeight;
    if (width <= 0 || height <= 0) throw new ImageImportError(`${file.name} has no video.`);
    const size = capImageSize(width, height);
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    canvas.getContext('2d')!.drawImage(element, 0, 0, size.width, size.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new ImageImportError(`${file.name} could not be read.`))), 'image/png'),
    );
    const posterBytes = new Uint8Array(await blob.arrayBuffer());
    const videoBytes = new Uint8Array(await file.arrayBuffer());
    return {
      video: { hash: await sha256Hex(videoBytes), bytes: videoBytes, mime: file.type, width, height },
      poster: { hash: await sha256Hex(posterBytes), bytes: posterBytes, mime: 'image/png', width: size.width, height: size.height },
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Video files in a DataTransfer (drop or paste), in order. */
export const videoFilesOf = (data: DataTransfer | null): File[] => (data ? Array.from(data.files).filter(isVideoFile) : []);
