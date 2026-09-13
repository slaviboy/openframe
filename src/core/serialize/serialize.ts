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

import { assertDocumentInvariants } from '../document/invariants';
import { DocumentStore } from '../document/store';
import { migrateToCurrent } from '../migrations/migrations';
import { DocumentSchema, FORMAT_NAME, FORMAT_VERSION, type SerializedDocument } from '../schema/document';
import { parseUntrustedJson } from './safe-json';

export class DocumentLoadError extends Error {
  constructor(
    message: string,
    readonly issues: readonly string[] = [],
  ) {
    super(message);
    this.name = 'DocumentLoadError';
  }
}

export function toSerialized(store: DocumentStore): SerializedDocument {
  const nodes: SerializedDocument['nodes'] = {};
  for (const node of store.nodes()) nodes[node.id] = node;
  return { format: FORMAT_NAME, version: FORMAT_VERSION, meta: store.meta, nodes };
}

/**
 * Deterministic JSON: object keys sorted lexicographically at every level,
 * `-0` normalized to `0`, no insignificant whitespace. The same document always
 * produces identical bytes, which enables hashing, dedup, and stable diffs.
 */
export function canonicalStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) out[key] = sortKeys(v);
    }
    return out;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('canonicalStringify: non-finite number');
    return Object.is(value, -0) ? 0 : value;
  }
  return value;
}

export const serializeDocument = (store: DocumentStore): string => canonicalStringify(toSerialized(store));

/**
 * Parses untrusted JSON text into a validated, migrated document store.
 * Guards against prototype pollution by rejecting `__proto__`/`constructor`/`prototype` keys.
 */
export function deserializeDocument(text: string): DocumentStore {
  let raw: unknown;
  try {
    raw = parseUntrustedJson(text);
  } catch (error) {
    const message = error instanceof Error && error.message.startsWith('Forbidden key') ? `${error.message} in document` : 'File is not valid JSON';
    throw new DocumentLoadError(message);
  }
  return loadDocument(raw);
}

export function loadDocument(raw: unknown): DocumentStore {
  if (!raw || typeof raw !== 'object' || (raw as { format?: unknown }).format !== FORMAT_NAME) {
    throw new DocumentLoadError('Not an Openframe document');
  }
  const migrated = migrateToCurrent(raw as { version: number });
  const parsed = DocumentSchema.safeParse(migrated);
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 20).map((i) => `${i.path.join('.')}: ${i.message}`);
    throw new DocumentLoadError('Document failed validation', issues);
  }
  for (const [key, node] of Object.entries(parsed.data.nodes)) {
    if (node.id !== key) throw new DocumentLoadError(`Node key ${key} does not match id ${node.id}`);
  }
  let store: DocumentStore;
  try {
    store = new DocumentStore(parsed.data.meta, Object.values(parsed.data.nodes));
    assertDocumentInvariants(store);
  } catch (error) {
    throw new DocumentLoadError('Document structure is invalid', [error instanceof Error ? error.message : String(error)]);
  }
  return store;
}
