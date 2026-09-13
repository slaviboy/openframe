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

import { keyOnTop, makeLine } from '@/core/document/factory';
import type { Transaction } from '@/core/history/history';
import type { Id } from '@/core/ids/ids';
import { fromPoints, type Rect } from '@/core/math/rect';
import type { Vec2 } from '@/core/math/vec';
import { guidesFor, type SnapGuide } from '@/core/scene/snapping';
import { snapCandidatesIn } from '../interactions/snap-candidates';
import { constrain45, containerAt, lineTransform, nextLayerName, parentToLocal, roundPoint, snapWorldPoint } from './draw-helpers';
import type { CursorKind, ModifierState, PointerInfo, Tool, ToolEnvironment } from './types';

type LineKind = 'line' | 'arrow';

/** Length of a line created by clicking without dragging. */
const CLICK_LENGTH = 100;

interface Drawing {
  tx: Transaction;
  id: Id;
  startWorld: Vec2;
  toLocal: (world: Vec2) => Vec2;
  origin: Vec2;
  down: PointerInfo;
  last: PointerInfo;
  dragged: boolean;
  candidates: Rect[];
  guides: readonly SnapGuide[];
}

/**
 * Line (L) and Arrow (⇧L) tools. Drag from start to end point (Shift constrains to 45°);
 * click places a 100px horizontal line. The end point snaps to nearby layer edges and centers.
 * An arrow is a line whose end cap is a line arrow.
 */
export class LineTool implements Tool {
  private drawing: Drawing | null = null;

  constructor(
    readonly id: LineKind,
    private readonly env: ToolEnvironment,
  ) {}

  get active(): boolean {
    return this.drawing !== null;
  }

  get snapGuides(): readonly SnapGuide[] {
    return this.drawing?.guides ?? [];
  }

  cursor(): CursorKind {
    return 'crosshair';
  }

  pointerDown(p: PointerInfo): void {
    if (p.button !== 0) return;
    const { editor } = this.env;
    editor.scene.ensure(editor.pageId);
    const parent = containerAt(editor, p.world);
    const candidates = snapCandidatesIn(editor, [parent]);
    const startWorld = snapWorldPoint(editor, p.world, candidates, p.ctrl).point;
    const toLocal = parentToLocal(editor, parent);
    const origin = roundPoint(toLocal(startWorld));
    const base = this.id === 'arrow' ? 'Arrow' : 'Line';
    const tx = editor.history.begin(`Create ${base.toLowerCase()}`);
    const id = editor.ids.next();
    const init = { id, parent: { id: parent, key: keyOnTop(editor.doc, parent) }, name: nextLayerName(editor, base), x: origin.x, y: origin.y, width: 0, height: 0 };
    tx.create(makeLine(init, this.id === 'arrow' ? 'LINE_ARROW' : 'NONE'));
    editor.state.select([id]);
    this.drawing = { tx, id, startWorld, toLocal, origin, down: p, last: p, dragged: false, candidates, guides: [] };
    tx.flushPreview();
  }

  pointerMove(p: PointerInfo): void {
    const d = this.drawing;
    if (!d) return;
    d.last = p;
    if (!d.dragged && Math.hypot(p.screen.x - d.down.screen.x, p.screen.y - d.down.screen.y) < this.env.dragThresholdPx) return;
    d.dragged = true;
    this.update(p);
  }

  pointerUp(p: PointerInfo): void {
    const d = this.drawing;
    if (!d) return;
    const { editor } = this.env;
    if (d.dragged) this.update(p);
    else d.tx.set(d.id, 'size', { width: CLICK_LENGTH, height: 0 });
    const node = editor.doc.get(d.id);
    if (node?.type === 'LINE' && node.size.width < 1) d.tx.set(d.id, 'size', { width: 1, height: 0 });
    this.drawing = null;
    editor.history.commit(d.tx);
    editor.state.setTool('move');
  }

  modifiersChanged(m: ModifierState): void {
    if (this.drawing?.dragged) this.update({ ...this.drawing.last, ...m });
  }

  cancel(): boolean {
    if (!this.drawing) return false;
    this.env.editor.history.cancel(this.drawing.tx);
    this.drawing = null;
    return true;
  }

  private update(p: PointerInfo): void {
    const d = this.drawing!;
    let endWorld: Vec2;
    if (p.shift) {
      endWorld = constrain45(d.startWorld, p.world);
      d.guides = [];
    } else {
      const snap = snapWorldPoint(this.env.editor, p.world, d.candidates, p.ctrl);
      endWorld = snap.point;
      d.guides = snap.x || snap.y ? guidesFor(fromPoints(d.startWorld, snap.point), d.candidates, snap) : [];
    }
    const end = d.toLocal(endWorld);
    const dx = end.x - d.origin.x;
    const dy = end.y - d.origin.y;
    d.tx.set(d.id, 'transform', lineTransform(d.origin, Math.atan2(dy, dx)));
    d.tx.set(d.id, 'size', { width: Math.round(Math.hypot(dx, dy) * 100) / 100, height: 0 });
    d.tx.flushPreview();
    this.env.editor.requestRender();
  }
}
