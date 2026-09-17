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

import type { DocumentStore } from '../document/store';
import type { Id } from '../ids/ids';
import { isSceneNode, type Node, type Paint, type SceneNode } from '../schema/document';

/** What became of one layer between two versions of a file. */
export interface LayerChange {
  readonly nodeId: Id;
  readonly name: string;
  readonly kind: 'added' | 'removed' | 'changed';
  /** For a changed layer, the properties that differ and how they read either side. */
  readonly properties: readonly PropertyChange[];
}

export interface PropertyChange {
  readonly field: string;
  readonly before: string;
  readonly after: string;
}

const num = (value: number) => `${Math.round(value * 100) / 100}`;

/** A paint list as the comparison reads it: the first visible paint, by kind and colour. */
function paints(list: readonly Paint[] | undefined): string {
  const paint = list?.find((entry) => entry.visible && entry.opacity > 0);
  if (!paint) return 'none';
  if (paint.type !== 'SOLID') return paint.type.toLowerCase();
  const hex = (value: number) => Math.round(value * 255).toString(16).padStart(2, '0');
  return `#${hex(paint.color.r)}${hex(paint.color.g)}${hex(paint.color.b)}`.toUpperCase();
}

/** The properties a comparison looks at, and how each reads. A property a layer does not have reads as nothing. */
const FIELDS: readonly (readonly [string, (node: SceneNode) => string | null])[] = [
  ['Name', (node) => node.name],
  ['X', (node) => num(node.transform[4])],
  ['Y', (node) => num(node.transform[5])],
  ['Width', (node) => num(node.size.width)],
  ['Height', (node) => num(node.size.height)],
  ['Opacity', (node) => `${Math.round(node.opacity * 100)}%`],
  ['Visible', (node) => (node.visible === false ? 'no' : 'yes')],
  ['Fill', (node) => ('fills' in node ? paints(node.fills) : null)],
  ['Stroke', (node) => ('strokes' in node ? paints(node.strokes) : null)],
  ['Stroke weight', (node) => ('strokeWeight' in node ? num(node.strokeWeight) : null)],
  ['Corner radius', (node) => ('cornerRadius' in node ? num(node.cornerRadius ?? 0) : null)],
  ['Text', (node) => (node.type === 'TEXT' ? node.characters : null)],
  ['Font size', (node) => (node.type === 'TEXT' ? num(node.fontSize) : null)],
  ['Direction', (node) => (node.type === 'FRAME' && node.layoutMode ? node.layoutMode.toLowerCase() : null)],
  ['Gap', (node) => (node.type === 'FRAME' && node.layoutMode ? num(node.itemSpacing ?? 0) : null)],
  [
    'Padding',
    (node) => (node.type === 'FRAME' && node.layoutMode ? [node.paddingTop ?? 0, node.paddingRight ?? 0, node.paddingBottom ?? 0, node.paddingLeft ?? 0].map(num).join(' ') : null),
  ],
];

/** Every layer under a node, the node itself left out. */
function descendants(store: DocumentStore, id: Id, out: Id[] = []): Id[] {
  for (const child of store.children(id)) {
    out.push(child);
    descendants(store, child, out);
  }
  return out;
}

const scene = (node: Node | undefined): SceneNode | null => (node !== undefined && isSceneNode(node) ? node : null);

/**
 * What changed on a page between a saved version and the file as it stands: the layers added, the layers taken away,
 * and for the ones that are in both, the properties that read differently. Layers are matched by their id, which is
 * what a saved version and the file it was saved from share.
 */
export function compareVersions(before: DocumentStore, after: DocumentStore, pageId: Id): LayerChange[] {
  const wasThere = new Set(descendants(before, pageId));
  const isThere = new Set(descendants(after, pageId));
  const changes: LayerChange[] = [];

  for (const id of isThere) {
    const now = scene(after.get(id));
    if (!now) continue;
    if (!wasThere.has(id)) {
      changes.push({ nodeId: id, name: now.name, kind: 'added', properties: [] });
      continue;
    }
    const then = scene(before.get(id));
    if (!then) continue;
    const properties: PropertyChange[] = [];
    for (const [field, read] of FIELDS) {
      const was = read(then);
      const is = read(now);
      if (was === null || is === null || was === is) continue;
      properties.push({ field, before: was, after: is });
    }
    if (properties.length > 0) changes.push({ nodeId: id, name: now.name, kind: 'changed', properties });
  }

  for (const id of wasThere) {
    if (isThere.has(id)) continue;
    const then = scene(before.get(id));
    if (then) changes.push({ nodeId: id, name: then.name, kind: 'removed', properties: [] });
  }

  return changes;
}
