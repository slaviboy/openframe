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

/** Web Crypto, available in browsers, workers and Node; typed locally because core has no DOM lib. */
interface SubtleDigest {
  digest(algorithm: 'SHA-256', data: Uint8Array): Promise<ArrayBuffer>;
}

/** Lowercase hex SHA-256 of `bytes`: the content address of an image blob. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const { subtle } = (globalThis as unknown as { crypto: { subtle: SubtleDigest } }).crypto;
  const digest = await subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export const IMAGE_HASH_PATTERN = /^[0-9a-f]{64}$/;
