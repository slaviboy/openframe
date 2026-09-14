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

import { unzipSync, zipSync, type Zippable } from 'fflate';
import { usedImageHashes } from '@/core/document/image-references';
import type { DocumentStore } from '@/core/document/store';
import { IMAGE_HASH_PATTERN, sha256Hex } from '@/core/image/hash';
import { deserializeDocument, serializeDocument } from '@/core/serialize/serialize';

/** The extension of Openframe files saved to disk. */
export const PACKAGE_EXTENSION = '.openframe';

const MANIFEST = 'manifest.json';
const DOCUMENT = 'document.json';
const IMAGE_PREFIX = 'images/';
/** The largest entry a package may unpack to, so a malicious archive can't exhaust memory. */
const MAX_ENTRY_BYTES = 512 * 1024 * 1024;

export interface PackageImage {
  readonly hash: string;
  readonly bytes: Uint8Array;
  readonly mime: string;
  readonly width: number;
  readonly height: number;
}

interface Manifest {
  readonly kind: 'openframe-package';
  readonly version: 1;
  readonly images: ReadonlyArray<{ readonly hash: string; readonly mime: string; readonly width: number; readonly height: number }>;
}

/** A file that can't be read as an Openframe package; the message says why, for the person opening it. */
export class PackageError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'PackageError';
  }
}

function isManifest(value: unknown): value is Manifest {
  if (typeof value !== 'object' || value === null) return false;
  const manifest = value as Partial<Manifest>;
  return (
    manifest.kind === 'openframe-package' &&
    manifest.version === 1 &&
    Array.isArray(manifest.images) &&
    manifest.images.every(
      (image) =>
        typeof image === 'object' &&
        image !== null &&
        IMAGE_HASH_PATTERN.test(image.hash) &&
        typeof image.mime === 'string' &&
        image.mime.startsWith('image/') &&
        image.mime.length <= 100 &&
        Number.isInteger(image.width) &&
        image.width > 0 &&
        Number.isInteger(image.height) &&
        image.height > 0,
    )
  );
}

/**
 * An Openframe file (.openframe): a ZIP archive of a manifest, the document as canonical JSON, and the images it uses
 * (under `images/`, by content hash). Images `getImage` doesn't have are left out.
 */
export async function writePackage(store: DocumentStore, getImage: (hash: string) => Promise<PackageImage | undefined>): Promise<Uint8Array> {
  const images = (await Promise.all(usedImageHashes(store).map((hash) => getImage(hash)))).filter((image): image is PackageImage => image !== undefined);
  const manifest: Manifest = { kind: 'openframe-package', version: 1, images: images.map(({ hash, mime, width, height }) => ({ hash, mime, width, height })) };
  const encoder = new TextEncoder();
  const files: Zippable = {
    [MANIFEST]: encoder.encode(JSON.stringify(manifest)),
    [DOCUMENT]: encoder.encode(serializeDocument(store)),
  };
  // Images are compressed already.
  for (const image of images) files[`${IMAGE_PREFIX}${image.hash}`] = [image.bytes, { level: 0 }];
  return zipSync(files);
}

/**
 * Reads an Openframe file: its document (validated and migrated like any saved document) and its images, each checked
 * against its content hash. Throws PackageError when the file isn't an Openframe file or is damaged.
 */
export async function readPackage(bytes: Uint8Array): Promise<{ store: DocumentStore; images: PackageImage[] }> {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (entry) => (entry.name === MANIFEST || entry.name === DOCUMENT || (entry.name.startsWith(IMAGE_PREFIX) && IMAGE_HASH_PATTERN.test(entry.name.slice(IMAGE_PREFIX.length)))) && entry.originalSize <= MAX_ENTRY_BYTES,
    });
  } catch (error) {
    throw new PackageError('This file is not an Openframe file.', { cause: error });
  }
  const manifestBytes = files[MANIFEST];
  const documentBytes = files[DOCUMENT];
  if (!manifestBytes || !documentBytes) throw new PackageError('This file is not an Openframe file.');
  const decoder = new TextDecoder();
  let manifest: unknown;
  try {
    manifest = JSON.parse(decoder.decode(manifestBytes));
  } catch (error) {
    throw new PackageError('The file is damaged: its manifest could not be read.', { cause: error });
  }
  if (!isManifest(manifest)) throw new PackageError('This file was made by a newer version of Openframe, or is damaged.');
  let store: DocumentStore;
  try {
    store = deserializeDocument(decoder.decode(documentBytes));
  } catch (error) {
    throw new PackageError(`The file's document could not be loaded: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
  const images: PackageImage[] = [];
  for (const entry of manifest.images) {
    const data = files[`${IMAGE_PREFIX}${entry.hash}`];
    if (!data) throw new PackageError(`The file is damaged: an image (${entry.hash.slice(0, 8)}) is missing.`);
    if ((await sha256Hex(data)) !== entry.hash) throw new PackageError(`The file is damaged: an image (${entry.hash.slice(0, 8)}) doesn't match its contents.`);
    images.push({ hash: entry.hash, bytes: data, mime: entry.mime, width: entry.width, height: entry.height });
  }
  return { store, images };
}
