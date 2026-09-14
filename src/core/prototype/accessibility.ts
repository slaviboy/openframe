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
import type { SceneNode } from '../schema/document';

/**
 * Accessible prototypes: what a screen reader finds in a screen. Top-level frames, components and instances are
 * sections labelled with their layer names; layers with an On click interaction are links (Navigate to, Open link) or
 * buttons (any other action); shapes with an image fill are images named after the layer; text layers are text.
 */
export type AccessibleNode =
  | { readonly kind: 'section'; readonly nodeId: Id; readonly label: string; readonly children: readonly AccessibleNode[] }
  | { readonly kind: 'link' | 'button' | 'image'; readonly nodeId: Id; readonly label: string }
  | { readonly kind: 'text'; readonly nodeId: Id; readonly text: string };

/** Shapes that show an image fill as an image (frames and groups hold layers instead). */
const SHAPE_TYPES: ReadonlySet<SceneNode['type']> = new Set(['RECTANGLE', 'ELLIPSE', 'POLYGON', 'STAR', 'VECTOR', 'BOOLEAN_OPERATION']);

const scene = (store: DocumentStore, id: Id): SceneNode | undefined => {
  const node = store.get(id);
  return node && 'transform' in node && node.visible ? node : undefined;
};

/** The text in a layer and the layers in it, in order. */
function textIn(store: DocumentStore, id: Id): string {
  const parts: string[] = [];
  const visit = (current: Id) => {
    const node = scene(store, current);
    if (!node) return;
    if (node.type === 'TEXT' && node.characters.trim()) parts.push(node.characters.trim());
    store.children(current).forEach(visit);
  };
  visit(id);
  return parts.join(' ');
}

/** Link for On click Navigate to and Open link; button for any other On click action; null without On click. */
function interactionKind(node: SceneNode): 'link' | 'button' | null {
  const first = node.reactions?.find((reaction) => reaction.trigger.type === 'ON_CLICK')?.actions[0];
  if (!first) return null;
  return (first.type === 'NODE' && first.navigation === 'NAVIGATE') || first.type === 'URL' ? 'link' : 'button';
}

/** A layer's children as they are read: an auto layout frame's in layout order, others top layer first (as the Layers panel lists them). */
function readingOrder(store: DocumentStore, node: SceneNode): Id[] {
  const children = store.children(node.id);
  return isAutoLayoutFrame(node) ? [...children] : [...children].reverse();
}

/** What a screen reader finds in a top-level frame (itself a section). */
export function accessibleContent(store: DocumentStore, frameId: Id): AccessibleNode[] {
  const visit = (id: Id): AccessibleNode[] => {
    const node = scene(store, id);
    if (!node) return [];
    const interactive = interactionKind(node);
    if (interactive) return [{ kind: interactive, nodeId: id, label: textIn(store, id) || node.name }];
    if (node.type === 'TEXT') return node.characters.trim() ? [{ kind: 'text', nodeId: id, text: node.characters }] : [];
    if (SHAPE_TYPES.has(node.type) && 'fills' in node && node.fills.some((paint) => paint.type === 'IMAGE' && paint.visible)) return [{ kind: 'image', nodeId: id, label: node.name }];
    const children = readingOrder(store, node).flatMap(visit);
    const labelled = id === frameId || (node.type === 'FRAME' && Boolean(node.component || node.componentSet || node.instance));
    return labelled ? [{ kind: 'section', nodeId: id, label: node.name, children }] : children;
  };
  return visit(frameId);
}
