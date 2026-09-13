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

/**
 * A random replica id for this editing session. IDs are `<replica>:<counter>`, so a
 * fresh replica per session guarantees new IDs never collide with IDs created in other
 * tabs, sessions, or imported files.
 */
export function createReplicaId(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  // 48 bits → base36 (≤ 10 chars), always lowercase alphanumerics as required by core ids.
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  return n.toString(36).padStart(10, '0');
}
