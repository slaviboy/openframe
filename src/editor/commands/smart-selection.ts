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
import type { Id } from '@/core/ids/ids';
import type { Rect } from '@/core/math/rect';
import type { Vec2 } from '@/core/math/vec';
import { detectSmartSelection, respace, spacingHandles, type SmartSelection } from '@/core/scene/smart-selection';
import type { SceneNode } from '@/core/schema/document';
import type { Editor } from '../editor';
import { captureStart, translateNodes, type NodeStart } from '../interactions/transform';
import { worldToScreen } from '../viewport/viewport';
import { selectedSceneNodes } from './selection-helpers';

export interface SmartSelectionInfo {
  readonly ids: readonly Id[];
  /** World bounds of each layer, parallel to `ids`. */
  readonly rects: readonly Rect[];
  readonly selection: SmartSelection;
}

/** The current selection as a smart selection (two or more unlocked layers in an evenly spaced row or column), or null. */
export function smartSelectionInfo(editor: Editor): SmartSelectionInfo | null {
  const ids = selectedSceneNodes(editor).filter((id) => !(editor.doc.get(id) as SceneNode).locked);
  if (ids.length < 2 || ids.length !== editor.selection.length) return null;
  editor.scene.ensure(editor.pageId);
  const rects: Rect[] = [];
  for (const id of ids) {
    const bounds = editor.scene.worldBounds(id);
    if (!bounds) return null;
    rects.push(bounds);
  }
  const selection = detectSmartSelection(rects);
  return selection ? { ids, rects, selection } : null;
}

/** Moves the layers so every gap equals `gap`, translating from captured starts (so previews don't accumulate). */
export function applySpacing(tx: Transaction, info: SmartSelectionInfo, starts: readonly NodeStart[], gap: number): void {
  const positions = respace(info.rects, info.selection, gap);
  info.ids.forEach((_, i) => {
    const rect = info.rects[i]!;
    const target = positions[i]!;
    translateNodes(tx, [starts[i]!], { x: target.x - rect.x, y: target.y - rect.y });
  });
}

export const captureSpacingStarts = (tx: Transaction, editor: Editor, info: SmartSelectionInfo): NodeStart[] =>
  info.ids.map((id) => captureStart(tx, editor.scene, id));

/** Sets the space between the layers of the current smart selection inside an open transaction. */
export function setSpacingInTx(tx: Transaction, editor: Editor, gap: number): void {
  const info = smartSelectionInfo(editor);
  if (info) applySpacing(tx, info, captureSpacingStarts(tx, editor, info), gap);
}

/** The spacing handle under a screen point, if any. */
export function spacingHandleAt(editor: Editor, info: SmartSelectionInfo, screen: Vec2, tolerancePx: number): boolean {
  const v = editor.state.viewport;
  return spacingHandles(info.rects, info.selection).some((handle) => {
    const p = worldToScreen(v, handle);
    return Math.abs(p.x - screen.x) <= tolerancePx && Math.abs(p.y - screen.y) <= tolerancePx * 2;
  });
}
