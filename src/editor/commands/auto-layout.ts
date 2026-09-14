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

import type { Transaction } from '@/core/history/history';
import { applyAutoLayout, clearAutoLayout, isAutoLayoutFrame } from '@/core/layout/auto-layout';
import { suggestAutoLayout } from '@/core/layout/suggest-auto-layout';
import type { Sizing } from '@/core/layout/flow-layout';
import type { Id } from '@/core/ids/ids';
import type { SceneNode } from '@/core/schema/document';
import type { Editor } from '../editor';
import { selectedSceneNodes } from './selection-helpers';
import { wrapSelection } from './structure';

const selectedNodes = (editor: Editor): SceneNode[] => selectedSceneNodes(editor).map((id) => editor.doc.getOrThrow(id) as SceneNode);

export const canAddAutoLayout = (editor: Editor): boolean => {
  const nodes = selectedNodes(editor);
  return nodes.length > 0 && nodes.every((n) => n.type !== 'SECTION');
};

export const canRemoveAutoLayout = (editor: Editor): boolean => selectedNodes(editor).some((n) => isAutoLayoutFrame(n));

/**
 * Add auto layout (⇧A): frames without auto layout get it in place; any other selection (layers, or
 * frames that already use auto layout) is wrapped in a new auto layout frame without a fill.
 */
export function addAutoLayout(editor: Editor): void {
  const nodes = selectedNodes(editor);
  if (nodes.length === 0 || !canAddAutoLayout(editor)) return;
  if (nodes.every((n) => n.type === 'FRAME' && !n.layoutMode)) {
    editor.history.run('Add auto layout', (tx) => nodes.forEach((n) => applyAutoLayout(tx, n.id)));
    return;
  }
  wrapSelection(editor, 'FRAME', {
    label: 'Add auto layout',
    after: (tx, frameId) => {
      tx.set(frameId, 'fills', []);
      applyAutoLayout(tx, frameId, { inferPadding: false });
    },
  });
}

/** Remove auto layout (⌥⇧A) from the selected auto layout frames; their children stay in place. */
export function removeAutoLayout(editor: Editor): void {
  const frames = selectedNodes(editor).filter((n) => isAutoLayoutFrame(n));
  if (frames.length === 0) return;
  editor.history.run('Remove auto layout', (tx) => frames.forEach((f) => clearAutoLayout(tx, f.id)));
}

/**
 * Sets a layer's resizing on one axis. Hug applies to auto layout frames and text, fill to children of
 * auto layout frames (a hugging parent becomes fixed on that axis). Text resizing maps onto its
 * auto-width, auto-height and fixed modes.
 */
export function setLayoutSizing(tx: Transaction, node: SceneNode, axis: 'horizontal' | 'vertical', sizing: Sizing): void {
  const current = tx.store.getOrThrow(node.id) as SceneNode;
  const field = axis === 'horizontal' ? 'layoutSizingHorizontal' : 'layoutSizingVertical';
  const parent = tx.store.get(current.parent.id);
  if (sizing === 'FILL' && !isAutoLayoutFrame(parent)) return;
  if (sizing === 'HUG' && current.type !== 'TEXT' && !isAutoLayoutFrame(current)) return;
  if (current.type === 'TEXT') {
    const mode = current.textAutoResize;
    let next = mode;
    if (axis === 'horizontal') {
      if (sizing === 'HUG') next = 'WIDTH_AND_HEIGHT';
      else if (mode === 'WIDTH_AND_HEIGHT') next = 'HEIGHT';
    } else if (sizing === 'HUG') {
      if (mode === 'NONE' || mode === 'TRUNCATE') next = 'HEIGHT';
    } else next = 'NONE';
    if (next !== mode) tx.set(node.id, 'textAutoResize', next);
    tx.set(node.id, field, sizing === 'FILL' ? 'FILL' : undefined);
  } else {
    tx.set(node.id, field, sizing === 'FIXED' ? undefined : sizing);
  }
  // In a grid, fill stretches over cells whose tracks the parent can still hug.
  if (sizing === 'FILL' && parent?.type === 'FRAME' && parent.layoutMode !== 'GRID' && parent[field] === 'HUG') {
    const parentAxisIsFlow = (parent.layoutMode === 'HORIZONTAL') === (axis === 'horizontal');
    // A parent can't hug a child that fills it along its flow.
    if (parentAxisIsFlow || tx.store.children(parent.id).length === 1) tx.set(parent.id, field, undefined);
  }
}

export type SizeLimitField = 'minWidth' | 'maxWidth' | 'minHeight' | 'maxHeight';

/** Sets or removes a min or max size. A text layer's max height replaces its max lines. */
export function setSizeLimit(tx: Transaction, node: SceneNode, field: SizeLimitField, value: number | undefined): void {
  tx.set(node.id, field, value === undefined ? undefined : Math.max(0, value));
  if (field === 'maxHeight' && value !== undefined && node.type === 'TEXT') tx.set(node.id, 'maxLines', undefined);
}

/** Ignore auto layout: the child leaves the flow, keeping its place and using constraints; fill resizing no longer applies. */
export function setIgnoreAutoLayout(tx: Transaction, node: SceneNode, on: boolean): void {
  if (!isAutoLayoutFrame(tx.store.get(node.parent.id))) return;
  tx.set(node.id, 'layoutPositioning', on ? 'ABSOLUTE' : undefined);
  if (on) {
    const current = tx.store.getOrThrow(node.id) as SceneNode;
    if (current.layoutSizingHorizontal === 'FILL') tx.set(node.id, 'layoutSizingHorizontal', undefined);
    if (current.layoutSizingVertical === 'FILL') tx.set(node.id, 'layoutSizingVertical', undefined);
  }
}

/**
 * Suggest auto layout (⌃⇧A): selected frames, and the frames inside them, get as much auto layout as
 * their arrangement allows, with rows or columns wrapped in new frames; any other selection is first
 * wrapped in a fill-less frame. One undo step.
 */
export function suggestAutoLayoutForSelection(editor: Editor): void {
  const nodes = selectedNodes(editor);
  if (nodes.length === 0 || !canAddAutoLayout(editor)) return;
  // The frames it creates or converts inside the selection get a blue dot in the layers panel.
  const changed: Id[] = [];
  if (nodes.every((n) => n.type === 'FRAME' && !isAutoLayoutFrame(n))) {
    editor.history.run('Suggest auto layout', (tx) => nodes.forEach((n) => changed.push(...suggestAutoLayout(tx, n.id, () => editor.ids.next()))));
    editor.state.markSuggested(changed.filter((id) => !nodes.some((n) => n.id === id)));
    return;
  }
  const container = wrapSelection(editor, 'FRAME', {
    label: 'Suggest auto layout',
    after: (tx, frameId) => {
      tx.set(frameId, 'fills', []);
      changed.push(...suggestAutoLayout(tx, frameId, () => editor.ids.next()));
    },
  });
  editor.state.markSuggested(changed.filter((id) => id !== container));
}
