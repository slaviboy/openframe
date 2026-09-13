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

import { z } from 'zod';
import { canParent } from '@/core/document/containment';
import { sortByPaintOrder } from '@/core/document/order';
import type { Id } from '@/core/ids/ids';
import type { Rect } from '@/core/math/rect';
import { IdSchema, isSceneNode, NodeSchema, TransformSchema, type Node, type SceneNode, type Transform } from '@/core/schema/document';
import { parseUntrustedJson } from '@/core/serialize/safe-json';
import { canonicalStringify } from '@/core/serialize/serialize';
import type { Editor } from '../editor';
import { selectedSceneNodes } from '../commands/selection-helpers';
import { toTransform } from '../interactions/transform';

export const CLIPBOARD_FORMAT = 'openframe/clipboard';
const HTML_MARKER = 'data-openframe-clipboard';
const MAX_ROOTS = 10_000;
const MAX_NODES = 100_000;

/**
 * Versioned clipboard payload. Nodes keep their source ids so internal parent references
 * can be remapped on paste; root layers carry their world transform so they can be pasted
 * at the same canvas position into any parent.
 */
export interface ClipboardPayload {
  readonly format: typeof CLIPBOARD_FORMAT;
  readonly version: 1;
  /** Root layer ids in paint order (bottom-most first). */
  readonly roots: readonly Id[];
  /** Every node of every root subtree. */
  readonly nodes: readonly SceneNode[];
  readonly worldTransforms: Readonly<Record<Id, Transform>>;
  /** World bounds of the copied layers. */
  readonly bounds: Rect;
  /**
   * World position of the frame the layers were copied from, when they all share one frame
   * parent. Pasting into several frames keeps the same position relative to each frame.
   */
  readonly sourceOrigin?: { readonly x: number; readonly y: number };
}

export class ClipboardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClipboardError';
  }
}

export function createClipboardPayload(editor: Editor): ClipboardPayload | null {
  const store = editor.doc;
  const roots = sortByPaintOrder(store, selectedSceneNodes(editor));
  if (roots.length === 0) return null;
  editor.scene.ensure(editor.pageId);
  const nodes: SceneNode[] = [];
  const worldTransforms: Record<Id, Transform> = {};
  for (const root of roots) {
    for (const id of store.descendants(root)) nodes.push(store.getOrThrow(id) as SceneNode);
    worldTransforms[root] = toTransform(editor.scene.worldTransform(root));
  }
  const bounds = editor.selectionBounds(roots);
  if (!bounds) return null;
  const parents = new Set(roots.map((id) => store.parentOf(id)));
  const [onlyParent] = parents;
  const frameBounds = parents.size === 1 && onlyParent && store.get(onlyParent)?.type === 'FRAME' ? editor.scene.worldBounds(onlyParent) : null;
  return {
    format: CLIPBOARD_FORMAT,
    version: 1,
    roots,
    nodes,
    worldTransforms,
    bounds,
    ...(frameBounds ? { sourceOrigin: { x: frameBounds.x, y: frameBounds.y } } : {}),
  };
}

const escapeHtml = (text: string): string =>
  text.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

export function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

export function fromBase64(encoded: string): string {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

/**
 * HTML flavor placed on the system clipboard. The structured payload rides in a data
 * attribute (base64 JSON), so other apps receive readable layer names instead of JSON,
 * and other Openframe tabs can reconstruct the layers.
 */
export function encodeClipboardHtml(payload: ClipboardPayload): string {
  const names = payload.roots.map((id) => payload.nodes.find((n) => n.id === id)?.name ?? '').join(', ');
  return `<meta charset="utf-8"><div ${HTML_MARKER}="v1:${toBase64(canonicalStringify(payload))}">${escapeHtml(names)}</div>`;
}

/** Plain-text flavor: layer names, one per line. */
export function clipboardPlainText(payload: ClipboardPayload): string {
  return payload.roots.map((id) => payload.nodes.find((n) => n.id === id)?.name ?? '').join('\n');
}

/**
 * Extracts and validates a payload from clipboard HTML. Returns null when the HTML is not
 * Openframe content; throws ClipboardError when it claims to be but is invalid.
 */
export function decodeClipboardHtml(html: string): ClipboardPayload | null {
  // Any marker attribute means the content claims to be Openframe data; only its value is checked strictly.
  const marker = new RegExp(`${HTML_MARKER}="([^"]*)"`).exec(html);
  if (!marker) return null;
  const value = /^v1:([A-Za-z0-9+/]+={0,2})$/.exec(marker[1]!);
  if (!value) throw new ClipboardError('Clipboard content is damaged');
  let json: string;
  try {
    json = fromBase64(value[1]!);
  } catch {
    throw new ClipboardError('Clipboard content is damaged');
  }
  try {
    return validateClipboardPayload(parseUntrustedJson(json));
  } catch (error) {
    if (error instanceof ClipboardError) throw error;
    throw new ClipboardError('Clipboard content is not valid Openframe data');
  }
}

const finite = z.number().refine(Number.isFinite, 'must be finite');
const PayloadSchema = z.object({
  format: z.literal(CLIPBOARD_FORMAT),
  version: z.literal(1),
  roots: z.array(IdSchema).min(1).max(MAX_ROOTS),
  nodes: z.array(NodeSchema).min(1).max(MAX_NODES),
  worldTransforms: z.record(IdSchema, TransformSchema),
  bounds: z.object({ x: finite, y: finite, width: z.number().min(0), height: z.number().min(0) }),
  sourceOrigin: z.object({ x: finite, y: finite }).optional(),
});

/**
 * Validates untrusted payload data: schema, layer-only nodes, unique ids, every root
 * present with a world transform, and every non-root node's parent chain staying inside
 * the payload and reaching a root without cycles.
 */
export function validateClipboardPayload(raw: unknown): ClipboardPayload {
  const parsed = PayloadSchema.safeParse(raw);
  if (!parsed.success) throw new ClipboardError('Clipboard content is not valid Openframe data');
  const data = parsed.data;
  const byId = new Map<Id, SceneNode>();
  for (const node of data.nodes as Node[]) {
    if (!isSceneNode(node)) throw new ClipboardError('Clipboard content contains pages or documents');
    if (byId.has(node.id)) throw new ClipboardError('Clipboard content contains duplicate layers');
    byId.set(node.id, node);
  }
  const roots = new Set(data.roots);
  if (roots.size !== data.roots.length) throw new ClipboardError('Clipboard content contains duplicate roots');
  for (const root of data.roots) {
    if (!byId.has(root) || !data.worldTransforms[root]) throw new ClipboardError('Clipboard content is incomplete');
  }
  for (const node of byId.values()) {
    if (roots.has(node.id)) continue;
    let current = node;
    let steps = 0;
    while (!roots.has(current.id)) {
      const parent = byId.get(current.parent.id);
      if (!parent) throw new ClipboardError('Clipboard content references missing layers');
      if (!canParent(parent.type, current.type)) throw new ClipboardError('Clipboard content has an invalid hierarchy');
      current = parent;
      if (++steps > byId.size) throw new ClipboardError('Clipboard content has a cyclic hierarchy');
    }
  }
  return { ...data, nodes: [...byId.values()] } as ClipboardPayload;
}
