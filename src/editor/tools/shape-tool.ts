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

import { keyOnTop, makeEllipse, makeFrame, makePolygon, makeRectangle, makeSection, makeSlice, makeStar } from '@/core/document/factory';
import type { Transaction } from '@/core/history/history';
import type { Id } from '@/core/ids/ids';
import { fromPoints, type Rect } from '@/core/math/rect';
import type { Vec2 } from '@/core/math/vec';
import { guidesFor, type SnapGuide } from '@/core/scene/snapping';
import type { SceneNode } from '@/core/schema/document';
import { adoptCoveredLayers } from '../commands/structure';
import { snapCandidatesIn } from '../interactions/snap-candidates';
import { containerAt, nextLayerName, parentToLocal, roundPoint, snapWorldPoint } from './draw-helpers';
import type { CursorKind, ModifierState, PointerInfo, Tool, ToolEnvironment } from './types';

type ShapeKind = 'frame' | 'section' | 'slice' | 'rectangle' | 'ellipse' | 'polygon' | 'star';

const BASE_NAMES: Record<ShapeKind, string> = {
  frame: 'Frame',
  section: 'Section',
  slice: 'Slice',
  rectangle: 'Rectangle',
  ellipse: 'Ellipse',
  polygon: 'Polygon',
  star: 'Star',
};
const MAKERS = {
  frame: makeFrame,
  section: makeSection,
  slice: makeSlice,
  rectangle: makeRectangle,
  ellipse: makeEllipse,
  polygon: makePolygon,
  star: makeStar,
} as const;
/** Size used when the tool is clicked without dragging. */
const CLICK_SIZE = 100;

interface Drawing {
  tx: Transaction;
  id: Id;
  parent: Id;
  /** Start point in parent-local coordinates. */
  origin: Vec2;
  /** Start point in world coordinates (after snapping). */
  startWorld: Vec2;
  toLocal: (world: Vec2) => Vec2;
  last: PointerInfo;
  dragged: boolean;
  down: PointerInfo;
  /** Layers the dragged corner snaps to (captured at gesture start). */
  candidates: Rect[];
  guides: readonly SnapGuide[];
}

/**
 * Frame (F/A), Rectangle (R), Ellipse (O), Polygon and Star tools. Drag to draw (Shift =
 * square, Alt = from center), click to place a 100×100 layer. The new layer is parented to
 * the frame under the start point. The start point and dragged corner snap to nearby layer
 * edges and centers (Control disables snapping). After drawing, the editor returns to the
 * Move tool.
 */
export class ShapeTool implements Tool {
  private drawing: Drawing | null = null;

  constructor(
    readonly id: ShapeKind,
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

  /** Keyboard placement (Return): a 100×100 layer centered on a world point, in one undo step, then the Move tool. */
  placeAt(world: Vec2): Id {
    const { editor } = this.env;
    editor.scene.ensure(editor.pageId);
    const parent = containerAt(editor, world, this.id === 'section' ? ['SECTION'] : undefined);
    const origin = roundPoint(parentToLocal(editor, parent)({ x: world.x - CLICK_SIZE / 2, y: world.y - CLICK_SIZE / 2 }));
    const id = editor.ids.next();
    editor.history.run(`Create ${BASE_NAMES[this.id].toLowerCase()}`, (tx) => {
      const init = {
        id,
        parent: { id: parent, key: keyOnTop(editor.doc, parent) },
        name: nextLayerName(editor, BASE_NAMES[this.id]),
        x: origin.x,
        y: origin.y,
        width: CLICK_SIZE,
        height: CLICK_SIZE,
      };
      tx.create(MAKERS[this.id](init));
      if (this.id === 'section') {
        tx.flushPreview();
        adoptCoveredLayers(tx, editor, [id]);
      }
    });
    editor.state.select([id]);
    editor.state.setTool('move');
    return id;
  }

  pointerDown(p: PointerInfo): void {
    if (p.button !== 0) return;
    const { editor } = this.env;
    editor.scene.ensure(editor.pageId);
    // Sections can only be created on the page or inside other sections.
    const parent = containerAt(editor, p.world, this.id === 'section' ? ['SECTION'] : undefined);
    const candidates = snapCandidatesIn(editor, [parent]);
    const startWorld = snapWorldPoint(editor, p.world, candidates, p.ctrl).point;
    const toLocal = parentToLocal(editor, parent);
    const origin = roundPoint(toLocal(startWorld));
    const tx = editor.history.begin(`Create ${BASE_NAMES[this.id].toLowerCase()}`);
    const id = editor.ids.next();
    const init = {
      id,
      parent: { id: parent, key: keyOnTop(editor.doc, parent) },
      name: nextLayerName(editor, BASE_NAMES[this.id]),
      x: origin.x,
      y: origin.y,
      width: 0,
      height: 0,
    };
    tx.create(MAKERS[this.id](init));
    editor.state.select([id]);
    this.drawing = { tx, id, parent, origin, startWorld, toLocal, last: p, dragged: false, down: p, candidates, guides: [] };
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
    if (!d.dragged) {
      d.tx.set(d.id, 'size', { width: CLICK_SIZE, height: CLICK_SIZE });
    } else {
      this.update(p);
    }
    const node = editor.doc.get(d.id) as SceneNode | undefined;
    if (node && (node.size.width < 1 || node.size.height < 1) && d.dragged) {
      // Degenerate drags still create a usable layer, matching click behavior.
      d.tx.set(d.id, 'size', { width: Math.max(1, node.size.width), height: Math.max(1, node.size.height) });
    }
    if (this.id === 'section') {
      // A section drawn over layers takes in the ones it fully covers.
      d.tx.flushPreview();
      adoptCoveredLayers(d.tx, editor, [d.id]);
    }
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
    const snap = snapWorldPoint(this.env.editor, p.world, d.candidates, p.ctrl);
    d.guides = snap.x || snap.y ? guidesFor(fromPoints(d.startWorld, snap.point), d.candidates, snap) : [];
    const cur = roundPoint(d.toLocal(snap.point));
    let w = cur.x - d.origin.x;
    let h = cur.y - d.origin.y;
    if (p.shift) {
      const s = Math.max(Math.abs(w), Math.abs(h));
      w = Math.sign(w || 1) * s;
      h = Math.sign(h || 1) * s;
    }
    let x0 = d.origin.x;
    let y0 = d.origin.y;
    let x1 = d.origin.x + w;
    let y1 = d.origin.y + h;
    if (p.alt) {
      x0 = d.origin.x - w;
      y0 = d.origin.y - h;
    }
    const x = Math.min(x0, x1);
    const y = Math.min(y0, y1);
    x1 = Math.max(x0, x1);
    y1 = Math.max(y0, y1);
    d.tx.set(d.id, 'transform', [1, 0, 0, 1, x, y]);
    d.tx.set(d.id, 'size', { width: x1 - x, height: y1 - y });
    d.tx.flushPreview();
    this.env.editor.requestRender();
  }
}
