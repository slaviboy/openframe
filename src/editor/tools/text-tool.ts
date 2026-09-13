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

import { keyOnTop, makeText } from '@/core/document/factory';
import { fromPoints, type Rect } from '@/core/math/rect';
import type { Vec2 } from '@/core/math/vec';
import type { TextNode } from '@/core/schema/document';
import { caret } from '@/core/text/text-editing';
import { beginTextEdit, newTextEditKey } from '../interactions/text-edit';
import { containerAt, parentToLocal, roundPoint } from './draw-helpers';
import type { CursorKind, PointerInfo, Tool, ToolEnvironment } from './types';

/**
 * Text tool (T). Clicking creates an auto-width text layer whose first line is centered on the
 * click; dragging creates a fixed-size text box. Either way editing starts right away and the Move
 * tool returns. Creating the layer and typing into it are one undo step, and a layer left empty
 * is removed.
 */
export class TextTool implements Tool {
  readonly id = 'text' as const;
  private down: PointerInfo | null = null;
  private current: Vec2 | null = null;
  private dragged = false;

  constructor(private readonly env: ToolEnvironment) {}

  get active(): boolean {
    return this.down !== null;
  }

  /** The text box being dragged out, in world coordinates (drawn like a marquee). */
  get draftRect(): Rect | null {
    return this.down && this.dragged && this.current ? fromPoints(this.down.world, this.current) : null;
  }

  cursor(): CursorKind {
    return 'text';
  }

  pointerDown(p: PointerInfo): void {
    if (p.button !== 0) return;
    this.down = p;
    this.current = p.world;
    this.dragged = false;
  }

  pointerMove(p: PointerInfo): void {
    if (!this.down) return;
    this.current = p.world;
    if (!this.dragged && Math.hypot(p.screen.x - this.down.screen.x, p.screen.y - this.down.screen.y) < this.env.dragThresholdPx) return;
    this.dragged = true;
    this.env.editor.requestRender();
  }

  pointerUp(p: PointerInfo): void {
    const down = this.down;
    if (!down) return;
    const dragged = this.dragged;
    this.down = null;
    this.current = null;
    this.dragged = false;
    const { editor } = this.env;
    editor.scene.ensure(editor.pageId);
    const parent = containerAt(editor, down.world);
    const toLocal = parentToLocal(editor, parent);
    const id = editor.ids.next();
    const base = makeText({ id, parent: { id: parent, key: keyOnTop(editor.doc, parent) }, name: 'Text', x: 0, y: 0, width: 0, height: 0 });
    let node: TextNode;
    const a = roundPoint(toLocal(down.world));
    const b = roundPoint(toLocal(p.world));
    if (dragged && Math.abs(b.x - a.x) >= 1 && Math.abs(b.y - a.y) >= 1) {
      node = { ...base, transform: [1, 0, 0, 1, Math.min(a.x, b.x), Math.min(a.y, b.y)], size: { width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) }, textAutoResize: 'NONE' };
    } else {
      const lineHeight = editor.textLayout?.measure(base, null).height ?? Math.round(base.fontSize * 1.21);
      const origin = roundPoint(toLocal({ x: down.world.x, y: down.world.y - lineHeight / 2 }));
      node = { ...base, transform: [1, 0, 0, 1, origin.x, origin.y] };
    }
    const key = newTextEditKey();
    editor.history.run('Create text', (tx) => tx.create({ ...node, autoRename: true }), { mergeKey: key });
    editor.state.setTool('move');
    beginTextEdit(editor, id, { created: true, key, selection: caret(0) });
  }

  cancel(): boolean {
    if (!this.down) return false;
    this.down = null;
    this.current = null;
    this.dragged = false;
    this.env.editor.requestRender();
    return true;
  }
}
