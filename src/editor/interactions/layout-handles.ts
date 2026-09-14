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

import type { Id } from '@/core/ids/ids';
import { isAutoLayoutFrame, layoutPadding } from '@/core/layout/auto-layout';
import { layoutHandles, type LayoutHandle } from '@/core/layout/layout-handles';
import { apply, type Matrix } from '@/core/math/matrix';
import { transformRect } from '@/core/math/rect';
import type { Vec2 } from '@/core/math/vec';
import { matrixOf } from '@/core/scene/scene-index';
import { isSceneNode, type SceneNode } from '@/core/schema/document';
import type { Editor } from '../editor';
import { worldToScreen } from '../viewport/viewport';

export interface SelectedLayoutHandles {
  readonly frameId: Id;
  readonly direction: 'HORIZONTAL' | 'VERTICAL' | 'GRID';
  readonly handles: readonly LayoutHandle[];
  /** The frame's local-to-world transform. */
  readonly toWorld: Matrix;
}

/** Handles are short bars across the direction they change: left/right padding and gaps in horizontal flows stand upright. */
export const isUprightHandle = (handle: LayoutHandle, direction: SelectedLayoutHandles['direction']): boolean =>
  handle.kind === 'padding' ? handle.side === 'left' || handle.side === 'right' : direction === 'HORIZONTAL';

/** The spacing handles of the selection when it is one unlocked, unrotated auto layout frame. */
export function selectedLayoutHandles(editor: Editor): SelectedLayoutHandles | null {
  if (editor.selection.length !== 1) return null;
  const frame = editor.doc.get(editor.selection[0]!);
  if (!isAutoLayoutFrame(frame) || frame.locked) return null;
  editor.scene.ensure(editor.pageId);
  const toWorld = editor.scene.worldTransform(frame.id);
  if (Math.abs(toWorld.b) > 1e-9 || Math.abs(toWorld.c) > 1e-9) return null;
  const children = editor.doc
    .children(frame.id)
    .map((id) => editor.doc.get(id))
    .filter((n): n is SceneNode => n !== undefined && isSceneNode(n) && n.visible && n.layoutPositioning !== 'ABSOLUTE')
    .map((n) => transformRect(matrixOf(n.transform), { x: 0, y: 0, width: n.size.width, height: n.size.height }));
  const handles = layoutHandles({
    size: frame.size,
    padding: layoutPadding(frame),
    direction: frame.layoutMode,
    wrap: frame.layoutWrap === true,
    autoGap: (frame.primaryAxisAlignItems ?? '').startsWith('SPACE_'),
    children,
  });
  return { frameId: frame.id, direction: frame.layoutMode, handles, toWorld };
}

/** The spacing handle under a screen point: within `tolerancePx` across the bar and twice that along it. */
export function hitLayoutHandle(editor: Editor, screen: Vec2, tolerancePx: number): { readonly selected: SelectedLayoutHandles; readonly handle: LayoutHandle } | null {
  const selected = selectedLayoutHandles(editor);
  if (!selected) return null;
  const v = editor.state.viewport;
  for (const handle of selected.handles) {
    const p = worldToScreen(v, apply(selected.toWorld, handle.at));
    const upright = isUprightHandle(handle, selected.direction);
    const [dx, dy] = [Math.abs(p.x - screen.x), Math.abs(p.y - screen.y)];
    if (upright ? dx <= tolerancePx && dy <= tolerancePx * 2 : dx <= tolerancePx * 2 && dy <= tolerancePx) return { selected, handle };
  }
  return null;
}
