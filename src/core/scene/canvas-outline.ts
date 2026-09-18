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
import { isAutoLayoutFrame } from '../layout/auto-layout';
import { isSceneNode, type SceneNode } from '../schema/document';
import type { SceneIndex } from './scene-index';

/** A layer of the canvas as a screen reader meets it: what it is, and the layers it holds. */
export interface OutlineItem {
  readonly id: Id;
  /** What the layer is called, and what it is, as one line of prose. */
  readonly label: string;
  /** The layers inside it, in the order they are read. */
  readonly children: readonly OutlineItem[];
  readonly hidden: boolean;
  readonly locked: boolean;
}

/** What a layer is called in prose, rather than by the name the schema gives its type. */
const KIND_LABELS: Readonly<Partial<Record<SceneNode['type'], string>>> = {
  FRAME: 'frame',
  GROUP: 'group',
  SECTION: 'section',
  RECTANGLE: 'rectangle',
  ELLIPSE: 'ellipse',
  POLYGON: 'polygon',
  STAR: 'star',
  LINE: 'line',
  VECTOR: 'vector',
  TEXT: 'text',
  BOOLEAN_OPERATION: 'boolean group',
  SLICE: 'slice',
};

/** A size or position as it is read out: whole pixels, since a screen reader has no use for the rest. */
const round = (value: number): string => String(Math.round(value));

/** What a layer is, beyond its name: a component or instance says so, and everything else is named by its type. */
export function layerKind(node: SceneNode): string {
  if (node.type === 'FRAME' && node.componentSet) return 'component set';
  if (node.type === 'FRAME' && node.component) return 'component';
  if (node.type === 'FRAME' && node.instance) return 'instance';
  return KIND_LABELS[node.type] ?? 'layer';
}

/**
 * One layer described in a sentence: its name, what it is, the words in it when it holds text, and the size and
 * place it takes on the canvas. This is what a screen reader reads out for a layer, on the canvas and in the
 * announcement that follows a selection.
 */
export function describeLayer(store: DocumentStore, index: SceneIndex, id: Id): string | null {
  const node = store.get(id);
  if (!node || !isSceneNode(node)) return null;
  // The size and place are read off the scene, which has to be built for the page the layer is on.
  const pageId = store.pageOf(id);
  if (pageId !== null) index.ensure(pageId);
  const parts = [node.name, layerKind(node)];
  if (node.type === 'TEXT' && node.characters.trim()) parts.push(`“${node.characters.trim()}”`);
  const bounds = index.worldBounds(id);
  if (bounds) parts.push(`${round(bounds.width)} by ${round(bounds.height)}, at ${round(bounds.x)}, ${round(bounds.y)}`);
  if (node.locked) parts.push('locked');
  if (!node.visible) parts.push('hidden');
  return parts.join(', ');
}

/**
 * The layers of a page as a tree, in the order a reader meets them: an auto layout frame's children in layout
 * order, every other layer's topmost first, which is the order the Layers panel lists them in. Hidden and locked
 * layers are there too, said to be so, since they are part of what the page holds.
 */
export function pageOutline(store: DocumentStore, index: SceneIndex, pageId: Id): OutlineItem[] {
  const walk = (parentId: Id): OutlineItem[] => {
    const children = store.children(parentId);
    const parent = store.get(parentId);
    const order = parent && isSceneNode(parent) && isAutoLayoutFrame(parent) ? [...children] : [...children].reverse();
    const out: OutlineItem[] = [];
    for (const id of order) {
      const node = store.get(id);
      if (!node || !isSceneNode(node)) continue;
      const label = describeLayer(store, index, id);
      if (label === null) continue;
      out.push({ id, label, children: walk(id), hidden: !node.visible, locked: node.locked === true });
    }
    return out;
  };
  return walk(pageId);
}

/** What is said when the selection changes: the one layer described, or how many were picked. */
export function describeSelection(store: DocumentStore, index: SceneIndex, ids: readonly Id[]): string {
  const [first, ...rest] = ids;
  if (first === undefined) return 'Nothing selected';
  if (rest.length > 0) return `${ids.length} layers selected`;
  const described = describeLayer(store, index, first);
  return described === null ? 'Nothing selected' : `${described}, selected`;
}
