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
import type { Editor } from '../editor';
import { apply } from '@/core/math/matrix';
import type { Vec2 } from '@/core/math/vec';
import { transformNetworkBy, type VectorNetwork } from '@/core/vector/vector-network';
import { matrixOf } from '@/core/scene/scene-index';
import type { Rect } from '@/core/math/rect';
import { hitTestDeepest } from '@/core/scene/hit-test';
import type { VectorNode } from '@/core/schema/document';
import { EMPTY_NETWORK, openEndAt, penClick, penResume, penStart, vertexAt, type PenState } from '@/core/vector/pen';
import { snapCandidatesIn } from '../interactions/snap-candidates';
import { containerAt, nextLayerName, parentToLocal, roundPoint, snapWorldPoint } from './draw-helpers';
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
  /** World bounds to snap points against, taken when the path began. */
  candidates: Rect[];
  /** Where the pointer last was, in the parent's space, for the line trailing the path. */
  at: Vec2;
}

/**
 * An open path the Pen can carry on from: the layer, the vertex at its end, and its network in the parent's
 * space. Only layers sitting square in their parent are offered, since the Pen draws in the parent's space.
 */
function resumable(editor: Editor, world: Vec2, tolerance: number): { readonly id: Id; readonly vertex: number; readonly network: VectorNetwork } | null {
  const id = hitTestDeepest(editor.doc, editor.scene, editor.pageId, world, { tolerance });
  const node = id === null ? undefined : (editor.doc.get(id) as VectorNode | undefined);
  if (node?.type !== 'VECTOR' || node.locked) return null;
  const t = node.transform;
  if (t[0] !== 1 || t[1] !== 0 || t[2] !== 0 || t[3] !== 1) return null;
  const network = transformNetworkBy(node.vectorNetwork, matrixOf(t));
  const toParent = parentToLocal(editor, node.parent.id);
  const vertex = openEndAt(network, toParent(world), tolerance);
  return vertex === null ? null : { id: node.id, vertex, network };
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
    const tolerance = this.env.hitTolerancePx / editor.state.viewport.zoom;
    if (!this.drawing) {
      // Starting on the end of a path already drawn carries that path on rather than beginning another layer.
      const resume = resumable(editor, p.world, tolerance);
      const parent = resume ? (editor.doc.getOrThrow(resume.id) as VectorNode).parent.id : containerAt(editor, p.world);
      const toLocal = parentToLocal(editor, parent);
      const candidates = snapCandidatesIn(editor, [parent], (id) => id === resume?.id);
      const tx = editor.history.begin(resume ? 'Edit vector' : 'Create vector');
      let id: Id;
      let state: PenState;
      if (resume) {
        id = resume.id;
        state = penResume(resume.network, resume.vertex);
      } else {
        id = editor.ids.next();
        const origin = roundPoint(toLocal(p.world));
        tx.create(makeVector({ id, parent: { id: parent, key: keyOnTop(editor.doc, parent) }, name: nextLayerName(editor, 'Vector'), x: origin.x, y: origin.y, width: 0, height: 0 }, EMPTY_NETWORK));
        state = penStart();
      }
      editor.state.select([id]);
      this.drawing = { tx, id, toLocal, state, before: state, down: p, downPoint: toLocal(p.world), existing: null, pressed: true, candidates, at: toLocal(p.world) };
      // A resumed path takes its first click from the point it left off, not from a new one.
      if (resume) {
        this.apply();
        return;
      }
    }
    const d = this.drawing;
    d.down = p;
    d.pressed = true;
    d.downPoint = this.placeAt(p);
    d.at = d.downPoint;
    d.existing = vertexAt(d.state.network, d.downPoint, tolerance);
    d.before = d.state;
    d.state = penClick(d.before, d.downPoint, { x: 0, y: 0 }, d.existing);
    this.apply();
  }

  /** Where a click puts its point: snapped to what is around it, unless Control is held, and on the pixel grid. */
  private placeAt(p: PointerInfo): Vec2 {
    const d = this.drawing!;
    const snapped = snapWorldPoint(this.env.editor, p.world, d.candidates, p.ctrl);
    return roundPoint(d.toLocal(snapped.point));
  }

  pointerMove(p: PointerInfo): void {
    const d = this.drawing;
    if (!d) return;
    // The line trailing the pointer follows it whether or not a handle is being pulled out.
    d.at = roundPoint(d.toLocal(p.world));
    this.env.editor.requestRender();
    if (!d.pressed || d.existing !== null) return;
    if (Math.hypot(p.screen.x - d.down.screen.x, p.screen.y - d.down.screen.y) < this.env.dragThresholdPx) return;
    const point = d.at;
    d.state = penClick(d.before, d.downPoint, { x: point.x - d.downPoint.x, y: point.y - d.downPoint.y });
    this.apply();
  }

  /**
   * The line trailing the path while it is drawn: from the point last placed to where the pointer is, in world
   * coordinates. Null before the first point, and once the path is closed or finished.
   */
  get rubberBand(): readonly [Vec2, Vec2] | null {
    const d = this.drawing;
    if (!d || d.state.last === null || d.pressed) return null;
    const from = d.state.network.vertices[d.state.last];
    if (!from) return null;
    const toWorld = this.env.editor.scene.computeWorld(this.parentOf(d));
    return [apply(toWorld, from), apply(toWorld, d.at)];
  }

  /** The parent whose space this path is being drawn in. */
  private parentOf(d: PenDrawing): Id {
    const node = this.env.editor.doc.get(d.id);
    return node && 'parent' in node ? node.parent.id : this.env.editor.pageId;
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
