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

import { isComponentSet, variantsOf } from '@/core/document/variants';
import type { Id } from '@/core/ids/ids';
import type { SceneNode } from '@/core/schema/document';
import type { Editor } from '../editor';
import { selectedSceneNodes } from './selection-helpers';

/** The component set a layer belongs to: the set itself, one of its variants, or a layer inside a variant. */
export function componentSetOf(editor: Editor, id: Id): Id | null {
  for (let cur: Id | null = id; cur !== null; cur = editor.doc.parentOf(cur)) {
    const node = editor.doc.get(cur) as SceneNode | undefined;
    if (!node) return null;
    if (isComponentSet(node)) return cur;
  }
  return null;
}

/** The variant of `setId` a layer is in, or the layer itself for a variant; null for the set. */
function variantOf(editor: Editor, setId: Id, id: Id): Id | null {
  for (let cur: Id | null = id; cur !== null && cur !== setId; cur = editor.doc.parentOf(cur)) {
    if (editor.doc.parentOf(cur) === setId) return cur;
  }
  return null;
}

/** The names of the layers from a variant down to a layer inside it. */
function namePath(editor: Editor, variantId: Id, id: Id): string[] {
  const names: string[] = [];
  for (let cur: Id | null = id; cur !== null && cur !== variantId; cur = editor.doc.parentOf(cur)) {
    names.unshift((editor.doc.get(cur) as SceneNode | undefined)?.name ?? '');
  }
  return names;
}

/**
 * The layers multi-edit variants works on for a selection in a component set: every variant for the set or a variant,
 * and for a layer inside a variant the layer with the same names down from every variant.
 */
export function matchingLayers(editor: Editor, setId: Id, ids: readonly Id[]): Id[] {
  const variants = variantsOf(editor.doc, setId).map((variant) => variant.id);
  const found = new Set<Id>();
  for (const id of ids) {
    const variant = variantOf(editor, setId, id);
    if (variant === null || variant === id) {
      for (const each of variants) found.add(each);
      continue;
    }
    const path = namePath(editor, variant, id);
    for (const other of variants) {
      let cur: Id | null = other;
      for (const name of path) cur = cur === null ? null : (editor.doc.children(cur).find((child) => (editor.doc.get(child) as SceneNode | undefined)?.name === name) ?? null);
      if (cur !== null) found.add(cur);
    }
  }
  return [...found];
}

/** Multi-edit variants applies to a selection inside one component set (outside vector editing), and ends while it is on. */
export function canMultiEditVariants(editor: Editor): boolean {
  const state = editor.state.getSnapshot();
  if (state.vectorEdit !== null) return false;
  if (state.multiEditSetId !== null) return true;
  const ids = selectedSceneNodes(editor);
  const sets = new Set(ids.map((id) => componentSetOf(editor, id)));
  return ids.length > 0 && sets.size === 1 && !sets.has(null);
}

/**
 * Multi-edit variants (Q): marks every variant of the selection's component set; a selected variant selects the other
 * variants and a selected layer the matching layers in every variant, so edits reach them all. Q again ends it, as does
 * selecting anything outside the set.
 */
export function toggleMultiEditVariants(editor: Editor): boolean {
  if (!canMultiEditVariants(editor)) return false;
  if (editor.state.getSnapshot().multiEditSetId !== null) {
    editor.state.setMultiEditSet(null);
    return true;
  }
  const ids = selectedSceneNodes(editor);
  const setId = componentSetOf(editor, ids[0]!)!;
  // With the set itself selected, the selection stays; the variants are only marked.
  if (!(ids.length === 1 && ids[0] === setId)) editor.state.select(matchingLayers(editor, setId, ids));
  editor.state.setMultiEditSet(setId);
  return true;
}
