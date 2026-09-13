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
import { hitTestDeepest, selectionTarget } from '@/core/scene/hit-test';
import type { ToolId } from '../stores/editor-store';
import type { CursorKind, PointerInfo, Tool, ToolEnvironment } from './types';

/**
 * Picks a layer by clicking it on the canvas for a caller (e.g. a pattern's "Select source"),
 * without changing the selection. Hover highlights the layer a click would pick. Escape or switching
 * tools cancels; the previous tool comes back either way.
 */
export class LayerPickTool implements Tool {
  readonly id = 'pickLayer' as const;
  readonly active = false;
  private pending: ((id: Id | null) => void) | null = null;
  private returnTool: ToolId = 'move';

  constructor(private readonly env: ToolEnvironment) {}

  pick(returnTool: ToolId): Promise<Id | null> {
    this.resolve(null);
    this.returnTool = returnTool;
    return new Promise((resolve) => {
      this.pending = resolve;
      this.env.editor.state.setTool('pickLayer');
    });
  }

  cursor(): CursorKind {
    return 'crosshair';
  }

  private target(p: PointerInfo): Id | null {
    const { editor } = this.env;
    const tolerance = this.env.hitTolerancePx / editor.state.viewport.zoom;
    const deepest = hitTestDeepest(editor.doc, editor.scene, editor.pageId, p.world, { tolerance });
    return deepest ? selectionTarget(editor.doc, editor.pageId, deepest, [], false) : null;
  }

  pointerMove(p: PointerInfo): void {
    this.env.editor.state.setHover(this.target(p));
  }

  pointerDown(p: PointerInfo): void {
    if (p.button !== 0) return;
    const id = this.target(p);
    if (!id) return;
    const resolve = this.pending;
    this.pending = null;
    this.env.editor.state.setHover(null);
    this.env.editor.state.setTool(this.returnTool);
    resolve?.(id);
  }

  pointerUp(): void {}

  cancel(): boolean {
    const { editor } = this.env;
    if (editor.state.getSnapshot().tool !== 'pickLayer') return false;
    const back = this.returnTool;
    this.leave();
    editor.state.setTool(back);
    return true;
  }

  /** The tool was switched away: cancel the request. */
  leave(): void {
    this.resolve(null);
    this.env.editor.state.setHover(null);
  }

  private resolve(id: Id | null): void {
    const resolve = this.pending;
    this.pending = null;
    resolve?.(id);
  }
}
