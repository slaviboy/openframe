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

import { apply } from '@/core/math/matrix';
import type { TextNode } from '@/core/schema/document';
import type { Editor } from '@/editor/editor';
import { worldToScreen } from '@/editor/viewport/viewport';
import type { Box } from '../primitives/position';

/** The screen box (client coordinates, rounded) of a range of text in a layer, or of the caret when it is empty. */
export function rangeBox(editor: Editor, node: TextNode, start: number, end: number): Box | null {
  const layout = editor.textLayout;
  const host = document.querySelector('[data-canvas-host]');
  if (!layout || !host) return null;
  const caret = layout.caretAt(node, start);
  const rects = end > start ? layout.selectionRects(node, start, end) : [{ x: caret.x, y: caret.top, width: 0, height: caret.bottom - caret.top }];
  if (rects.length === 0) return null;
  const matrix = editor.scene.worldTransform(node.id);
  const screen = rects
    .flatMap((r) => [
      { x: r.x, y: r.y },
      { x: r.x + r.width, y: r.y + r.height },
      { x: r.x + r.width, y: r.y },
      { x: r.x, y: r.y + r.height },
    ])
    .map((p) => worldToScreen(editor.state.viewport, apply(matrix, p)));
  const bounds = host.getBoundingClientRect();
  const xs = screen.map((p) => p.x);
  const ys = screen.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x: Math.round(bounds.left + x), y: Math.round(bounds.top + y), width: Math.round(Math.max(...xs) - x), height: Math.round(Math.max(...ys) - y) };
}

/** Returns keyboard input to the text being edited. */
export const focusText = () => document.querySelector<HTMLTextAreaElement>('[data-canvas-host] textarea')?.focus({ preventScroll: true });
