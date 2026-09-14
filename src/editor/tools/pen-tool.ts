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

import { keyOnTop, makeVector } from '@/core/document/factory';
import type { Transaction } from '@/core/history/history';
import type { Id } from '@/core/ids/ids';
import type { Vec2 } from '@/core/math/vec';
import { EMPTY_NETWORK, penClick, penStart, vertexAt, type PenState } from '@/core/vector/pen';
import { containerAt, nextLayerName, parentToLocal, roundPoint } from './draw-helpers';
import type { CursorKind, PointerInfo, Tool, ToolEnvironment } from './types';
import { placeNetwork } from './vector-draw';

interface PenDrawing {
  tx: Transaction;
  id: Id;
  toLocal: (world: Vec2) => Vec2;
  /** The path so far, in the parent's space. */
  state: PenState;
  /** The path before the point being placed, so dragging can re-place it with a handle. */
  before: PenState;
  down: PointerInfo;
  downPoint: Vec2;
  existing: number | null;
  pressed: boolean;
}

/**
 * Pen (P): each click adds a point connected to the previous one; dragging while placing a point
 * pulls out symmetric Bézier handles. Clicking a point of the path closes it into a region and
 * finishes the layer; Escape (or switching tools) finishes an open path. A path needs two points.
 */
export class PenTool implements Tool {
  readonly id = 'pen' as const;
  private drawing: PenDrawing | null = null;

  constructor(private readonly env: ToolEnvironment) {}

  get active(): boolean {
    return this.drawing !== null;
  }

  cursor(): CursorKind {
    return 'crosshair';
  }

  pointerDown(p: PointerInfo): void {
    if (p.button !== 0) return;
    const { editor } = this.env;
    editor.scene.ensure(editor.pageId);
    if (!this.drawing) {
      const parent = containerAt(editor, p.world);
      const toLocal = parentToLocal(editor, parent);
      const origin = roundPoint(toLocal(p.world));
      const tx = editor.history.begin('Create vector');
      const id = editor.ids.next();
      tx.create(makeVector({ id, parent: { id: parent, key: keyOnTop(editor.doc, parent) }, name: nextLayerName(editor, 'Vector'), x: origin.x, y: origin.y, width: 0, height: 0 }, EMPTY_NETWORK));
      editor.state.select([id]);
      this.drawing = { tx, id, toLocal, state: penStart(), before: penStart(), down: p, downPoint: origin, existing: null, pressed: true };
    }
    const d = this.drawing;
    d.down = p;
    d.pressed = true;
    d.downPoint = roundPoint(d.toLocal(p.world));
    d.existing = vertexAt(d.state.network, d.downPoint, this.env.hitTolerancePx / editor.state.viewport.zoom);
    d.before = d.state;
    d.state = penClick(d.before, d.downPoint, { x: 0, y: 0 }, d.existing);
    this.apply();
  }

  pointerMove(p: PointerInfo): void {
    const d = this.drawing;
    if (!d || !d.pressed || d.existing !== null) return;
    if (Math.hypot(p.screen.x - d.down.screen.x, p.screen.y - d.down.screen.y) < this.env.dragThresholdPx) return;
    const point = roundPoint(d.toLocal(p.world));
    d.state = penClick(d.before, d.downPoint, { x: point.x - d.downPoint.x, y: point.y - d.downPoint.y });
    this.apply();
  }

  pointerUp(): void {
    const d = this.drawing;
    if (!d) return;
    d.pressed = false;
    // Closing the path finishes the layer.
    if (d.state.last === null) this.finish();
  }

  cancel(): boolean {
    if (!this.drawing) return false;
    this.finish();
    return true;
  }

  private apply(): void {
    const d = this.drawing!;
    placeNetwork(d.tx, d.id, d.state.network);
    d.tx.flushPreview();
    this.env.editor.requestRender();
  }

  /** Keeps a path with at least one segment; a lone point is discarded. */
  private finish(): void {
    const d = this.drawing!;
    this.drawing = null;
    if (d.state.network.segments.length === 0) this.env.editor.history.cancel(d.tx);
    else this.env.editor.history.commit(d.tx);
  }
}
