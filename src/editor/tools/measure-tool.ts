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
import { addMeasurement } from '../commands/measurements';
import type { CursorKind, PointerInfo, Tool, ToolEnvironment } from './types';

/**
 * Measurement (⇧M): drags from one layer to another and saves the distance between them on the page, so everyone who
 * opens the file sees it. This is the measurement that is kept, as against the measuring ⌥ shows while hovering.
 */
export class MeasureTool implements Tool {
  readonly id = 'measure' as const;
  readonly active = false;
  /** The layer the drag started on, while one is under way. */
  private from: Id | null = null;

  constructor(private readonly env: ToolEnvironment) {}

  cursor(): CursorKind {
    return 'crosshair';
  }

  /** The layer under the pointer, which a measurement runs from or to. */
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
    this.from = this.target(p);
  }

  pointerUp(p: PointerInfo): void {
    const from = this.from;
    this.from = null;
    const to = this.target(p);
    if (from === null || to === null || from === to) return;
    addMeasurement(this.env.editor, from, to);
    this.env.editor.state.setHover(null);
    this.env.editor.requestRender();
  }

  cancel(): boolean {
    const dragging = this.from !== null;
    this.from = null;
    this.env.editor.state.setHover(null);
    return dragging;
  }
}
