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

import type { DocumentStore } from '@/core/document/store';
import type { Id } from '@/core/ids/ids';
import { isInteractive } from '@/core/scene/hit-test';
import { hasGeometry, isSceneNode, type SceneNode } from '@/core/schema/document';
import { canonicalStringify } from '@/core/serialize/serialize';
import type { Editor } from '../editor';
import { selectedSceneNodes } from './selection-helpers';

/** The top-level frame or group holding a layer, and the page or section it sits in. */
function matchRoot(store: DocumentStore, pageId: Id, id: Id): { root: Id; container: Id } | null {
  let current = id;
  for (let parent = store.parentOf(current); parent !== null; current = parent, parent = store.parentOf(current)) {
    if (parent === pageId || store.get(parent)?.type === 'SECTION') return current === id ? null : { root: current, container: parent };
  }
  return null;
}

/**
 * Select matching layers (⌥⌘A): for each selected layer inside a top-level frame or group,
 * the layers at the same place in the other top-level frames or groups of the same type in
 * the same page or section. "Same place" means the same chain of layer types and names from
 * the top-level container down. Returns the current selection plus the matches.
 */
export function matchingLayers(editor: Editor, ids: readonly Id[] = selectedSceneNodes(editor)): Id[] {
  const store = editor.doc;
  const result = new Set(ids);
  for (const id of ids) {
    const found = matchRoot(store, editor.pageId, id);
    if (!found) continue;
    const chain: { type: string; name: string }[] = [];
    for (let current = id; current !== found.root; current = store.parentOf(current)!) {
      const node = store.getOrThrow(current);
      chain.unshift({ type: node.type, name: node.name });
    }
    const rootType = store.get(found.root)?.type;
    for (const other of store.children(found.container)) {
      if (other === found.root || store.get(other)?.type !== rootType) continue;
      let current: Id | undefined = other;
      for (const step of chain) {
        current = store.children(current).find((child) => {
          const node = store.get(child);
          return node?.type === step.type && node.name === step.name;
        });
        if (!current) break;
      }
      if (current && isInteractive(store, current)) result.add(current);
    }
  }
  return [...result];
}

export type SameProperty = 'fill' | 'stroke' | 'effect' | 'font' | 'instance' | 'properties';

function signature(node: SceneNode, property: SameProperty): string | null {
  if (property === 'properties') {
    const geometry = hasGeometry(node) ? [node.fills, node.strokes, node.strokeWeight, node.strokeAlign] : null;
    const corner = 'cornerRadius' in node ? node.cornerRadius : null;
    return canonicalStringify([node.type, node.opacity, node.blendMode, geometry, corner]);
  }
  // The effects a layer carries, whatever kind of layer it is.
  if (property === 'effect') return node.effects && node.effects.length > 0 ? canonicalStringify(node.effects) : null;
  // A text layer's typeface, and the size and weight it is set in.
  if (property === 'font') return node.type === 'TEXT' ? canonicalStringify([node.fontName, node.fontSize]) : null;
  // The component an instance is of, so every instance of the same one is found.
  if (property === 'instance') return node.type === 'FRAME' && node.instance ? node.instance.mainId : null;
  if (!hasGeometry(node)) return null;
  if (property === 'fill') return node.fills.length > 0 ? canonicalStringify(node.fills) : null;
  return node.strokes.length > 0 ? canonicalStringify([node.strokes, node.strokeWeight, node.strokeAlign]) : null;
}

/**
 * Select all with same fill / stroke / properties: every visible, unlocked layer on the
 * current page whose value equals that of a selected layer. Empty when the selection has none.
 */
export function layersWithSame(editor: Editor, property: SameProperty): Id[] {
  const store = editor.doc;
  const wanted = new Set(
    selectedSceneNodes(editor)
      .map((id) => signature(store.getOrThrow(id) as SceneNode, property))
      .filter((s): s is string => s !== null),
  );
  if (wanted.size === 0) return [];
  const out: Id[] = [];
  for (const id of store.descendants(editor.pageId, false)) {
    const node = store.get(id);
    if (!node || !isSceneNode(node) || !isInteractive(store, id)) continue;
    const s = signature(node, property);
    if (s !== null && wanted.has(s)) out.push(id);
  }
  return out;
}
