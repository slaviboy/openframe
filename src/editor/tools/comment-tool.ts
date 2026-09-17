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

import type { Vec2 } from '@/core/math/vec';
import { commentAt } from '../chrome/comment-pins';
import type { CursorKind, PointerInfo, Tool, ToolEnvironment } from './types';

/** How far the pointer travels before a comment is a region rather than a pin, in world units. */
const REGION_THRESHOLD = 4;

/**
 * Comment mode (C): clicking the canvas starts a comment pinned there, and dragging starts one over a region. Clicking
 * a comment that is already there opens it instead. Nothing on the canvas is edited while this tool is in hand.
 */
export class CommentTool implements Tool {
  readonly id = 'comment' as const;
  private start: Vec2 | null = null;
  private moved = false;

  constructor(private readonly env: ToolEnvironment) {}

  get active(): boolean {
    return this.start !== null;
  }

  cursor(): CursorKind {
    return 'crosshair';
  }

  pointerDown(p: PointerInfo): void {
    if (p.button !== 0) return;
    const { editor } = this.env;
    // A comment already there is opened rather than written over.
    const existing = commentAt(editor, p.screen);
    if (existing !== null) {
      editor.state.setOpenComment(existing);
      return;
    }
    this.start = p.world;
    this.moved = false;
  }

  pointerMove(p: PointerInfo): void {
    if (this.start === null) return;
    if (Math.abs(p.world.x - this.start.x) > REGION_THRESHOLD || Math.abs(p.world.y - this.start.y) > REGION_THRESHOLD) this.moved = true;
  }

  pointerUp(p: PointerInfo): void {
    const start = this.start;
    this.start = null;
    if (start === null) return;
    const { editor } = this.env;
    if (!this.moved) {
      editor.state.setPendingComment({ x: start.x, y: start.y });
      return;
    }
    // A region is kept as its top-left corner and its size, however it was dragged out.
    const x = Math.min(start.x, p.world.x);
    const y = Math.min(start.y, p.world.y);
    editor.state.setPendingComment({ x, y, width: Math.abs(p.world.x - start.x), height: Math.abs(p.world.y - start.y) });
  }

  cancel(): boolean {
    const writing = this.start !== null || this.env.editor.state.getSnapshot().pendingComment !== null;
    this.start = null;
    this.env.editor.state.setPendingComment(null);
    return writing;
  }
}
