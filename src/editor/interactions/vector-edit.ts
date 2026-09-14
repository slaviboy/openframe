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

import type { Transaction } from '@/core/history/history';
import type { Id } from '@/core/ids/ids';
import { apply, applyLinear, invert, type Matrix } from '@/core/math/matrix';
import type { Vec2 } from '@/core/math/vec';
import { nodeContainsLocal } from '@/core/scene/scene-index';
import { DEFAULT_SHAPE_FILL, solid } from '@/core/document/factory';
import type { Paint, Transform, VectorNode } from '@/core/schema/document';
import { cutVertex, deleteVertices, healVertices, moveVertices, nearestOnSegments, splitSegment } from '@/core/vector/vector-edit';
import { bendVertex, oppositeEnd, setTangent, tangentAt, type SegmentEnd } from '@/core/vector/vector-bend';
import { regionAt, setRegionFills } from '@/core/vector/vector-paint';
import type { VectorNetwork } from '@/core/vector/vector-network';
import { paintsEqual } from '../commands/properties';
import type { Editor } from '../editor';
import { refitVector } from '../tools/vector-draw';
import type { CursorKind, PointerInfo, Tool } from '../tools/types';
import type { VectorEditTool } from '../stores/editor-store';
import { worldToScreen } from '../viewport/viewport';
import { hitHandle } from './vector-handles';

/** Vector edit mode can start on a single selected, unlocked vector layer. */
export function canBeginVectorEdit(editor: Editor): boolean {
  if (editor.state.getSnapshot().vectorEdit || editor.selection.length !== 1) return false;
  const node = editor.doc.get(editor.selection[0]!);
  return node?.type === 'VECTOR' && !node.locked;
}

/** Enters vector edit mode on a vector layer (selecting it). */
export function beginVectorEdit(editor: Editor, id: Id): boolean {
  const node = editor.doc.get(id);
  if (node?.type !== 'VECTOR' || node.locked) return false;
  editor.state.select([id]);
  editor.state.setVectorEdit({ nodeId: id, vertices: [] });
  return true;
}

/** Leaves vector edit mode. */
export function endVectorEdit(editor: Editor): boolean {
  if (!editor.state.getSnapshot().vectorEdit) return false;
  editor.state.setVectorEdit(null);
  return true;
}

/** Picks the secondary toolbar's tool while a vector is being edited. */
export function setVectorEditTool(editor: Editor, tool: VectorEditTool): boolean {
  const state = editor.state.getSnapshot().vectorEdit;
  if (!state) return false;
  editor.state.setVectorEdit({ ...state, tool });
  return true;
}

const editedVector = (editor: Editor): VectorNode | null => {
  const state = editor.state.getSnapshot().vectorEdit;
  const node = state ? editor.doc.get(state.nodeId) : undefined;
  return node?.type === 'VECTOR' ? node : null;
};

/** The Paint tool's paint: the one picked for it, else the layer's first solid fill, else the default shape fill. */
export function vectorEditPaint(editor: Editor): Paint {
  const state = editor.state.getSnapshot().vectorEdit;
  return state?.paint ?? editedVector(editor)?.fills.find((p) => p.type === 'SOLID') ?? solid(DEFAULT_SHAPE_FILL);
}

/** Deletes the selected points of the vector being edited (with their segments), as one undo step. */
export function deleteSelectedPoints(editor: Editor): boolean {
  const state = editor.state.getSnapshot().vectorEdit;
  const node = editedVector(editor);
  if (!state || !node || state.vertices.length === 0) return false;
  editor.history.run('Delete points', (tx) => refitVector(tx, node.id, deleteVertices(node.vectorNetwork, state.vertices)));
  editor.state.setVectorEdit({ ...state, nodeId: node.id, vertices: [] });
  return true;
}

/** ⇧Delete: deletes the selected points and heals the path across them. */
export function healSelectedPoints(editor: Editor): boolean {
  const state = editor.state.getSnapshot().vectorEdit;
  const node = editedVector(editor);
  if (!state || !node || state.vertices.length === 0) return false;
  editor.history.run('Delete and heal points', (tx) => refitVector(tx, node.id, healVertices(node.vectorNetwork, state.vertices)));
  editor.state.setVectorEdit({ ...state, nodeId: node.id, vertices: [] });
  return true;
}

/** Whether a point is inside a polygon (even-odd rule). */
function insidePolygon(p: Vec2, polygon: readonly Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** A lasso being drawn: its screen outline so far, and whether Shift adds to the point selection. */
interface LassoDrag {
  readonly points: Vec2[];
  readonly shift: boolean;
}

/** Dragging Bézier handles: out of a point with Bend, or one handle of a selected point. */
type HandleGesture = {
  readonly tx: Transaction;
  /** The network the drag works from, in the space of `startTransform` (`startInverse` maps world points into it). */
  readonly start: VectorNetwork;
  readonly startTransform: Transform;
  readonly startInverse: Matrix;
  readonly down: PointerInfo;
  moved: boolean;
} & (
  | { readonly kind: 'bend'; readonly vertex: number; /** A point was added on the path first. */ readonly added: boolean }
  | { readonly kind: 'handle'; readonly end: SegmentEnd; readonly origin: { readonly x: number; readonly y: number }; readonly mirror: SegmentEnd | null }
);

/** Painting regions: the paint set on (or, when the first region already showed it, removed from) each region the drag crosses. */
interface PaintDrag {
  readonly tx: Transaction;
  readonly paint: Paint;
  readonly remove: boolean;
  readonly painted: Set<number>;
}

interface PointDrag {
  tx: Transaction;
  start: VectorNetwork;
  startTransform: Transform;
  down: PointerInfo;
  vertices: readonly number[];
  moved: boolean;
}

/**
 * Pointer handling in vector edit mode (routed by the ToolManager while `vectorEdit` is set): click a
 * point to select it (Shift adds or removes), drag selected points to move them, double-click a path
 * to add a point, click inside the layer to clear the point selection, and click elsewhere to leave.
 * With the Lasso (Q), a drag draws an outline that selects the points inside it (Shift adds); a click clears.
 * With Cut (X), clicking a point or a path breaks the path there, leaving its ends selected.
 * With Bend, pressing on a point (or a path, adding a point) and dragging pulls out mirrored handles.
 * The handles of selected points can be dragged; handles that mirrored each other keep mirroring.
 * With Paint (⇧B), clicking a closed region fills it with the paint, or removes a fill that already matches it; a drag paints every region it crosses.
 */
export class VectorEditController implements Tool {
  readonly id = 'move' as const;
  private drag: PointDrag | null = null;
  private lasso: LassoDrag | null = null;
  private handle: HandleGesture | null = null;
  private painting: PaintDrag | null = null;
  private hover: { readonly region: number; readonly remove: boolean } | null = null;

  constructor(
    private readonly editor: Editor,
    private readonly tolerancePx: number,
  ) {}

  get active(): boolean {
    return this.drag !== null || this.lasso !== null || this.handle !== null || this.painting !== null;
  }

  /** Screen outline of the lasso being drawn, for the overlay. */
  get lassoPath(): readonly Vec2[] | null {
    return this.lasso?.points ?? null;
  }

  /** The region under the pointer with the Paint tool, and whether a click there removes its fill. */
  get paintHover(): { readonly region: number; readonly remove: boolean } | null {
    return this.editor.state.getSnapshot().vectorEdit?.tool === 'paint' ? this.hover : null;
  }

  cursor(): CursorKind {
    return 'default';
  }

  pointerDown(p: PointerInfo): void {
    const { editor } = this;
    const state = editor.state.getSnapshot().vectorEdit;
    const node = editedVector(editor);
    if (!state || !node) {
      endVectorEdit(editor);
      return;
    }
    if (state.tool === 'lasso') {
      this.lasso = { points: [{ ...p.screen }], shift: p.shift };
      return;
    }
    editor.scene.ensure(editor.pageId);
    const toWorld = editor.scene.worldTransform(node.id);
    const v = editor.state.viewport;
    if (state.tool === 'paint') {
      const region = this.regionUnder(node, p.world);
      if (region === null) return;
      const paint = vectorEditPaint(editor);
      const remove = paintsEqual(node.vectorNetwork.regions[region]!.fills ?? node.fills, [paint]);
      this.painting = { tx: editor.history.begin(remove ? 'Remove region fill' : 'Paint region'), paint, remove, painted: new Set() };
      this.paintRegion(region);
      return;
    }
    const startInverse = invert(toWorld);
    const handle = state.tool === 'cut' || !startInverse ? null : hitHandle(editor, p.screen, this.tolerancePx);
    if (handle && startInverse) {
      const network = node.vectorNetwork;
      const opposite = oppositeEnd(network, handle.end);
      const t = tangentAt(network, handle.end);
      const o = opposite ? tangentAt(network, opposite) : null;
      const mirrored = o !== null && Math.abs(t.x + o.x) < 1e-6 && Math.abs(t.y + o.y) < 1e-6;
      const tx = editor.history.begin('Move handle');
      this.handle = { kind: 'handle', tx, start: network, startTransform: node.transform, startInverse, down: p, moved: false, end: handle.end, origin: network.vertices[handle.vertex]!, mirror: mirrored ? opposite : null };
      return;
    }
    const hit = node.vectorNetwork.vertices.findIndex((vertex) => {
      const s = worldToScreen(v, apply(toWorld, vertex));
      return Math.abs(s.x - p.screen.x) <= this.tolerancePx && Math.abs(s.y - p.screen.y) <= this.tolerancePx;
    });
    if (state.tool === 'bend') {
      const bendLocal = startInverse ? apply(startInverse, p.world) : null;
      const nearest = hit === -1 && bendLocal ? nearestOnSegments(node.vectorNetwork, bendLocal) : null;
      const onPath = nearest && nearest.distance * Math.hypot(toWorld.a, toWorld.b) * v.zoom <= this.tolerancePx ? nearest : null;
      if (!startInverse || (hit === -1 && !onPath)) {
        editor.state.setVectorEdit({ ...state, vertices: [] });
        return;
      }
      const tx = editor.history.begin('Bend');
      // On a path, the bend pulls out of a point added there.
      const split = onPath ? splitSegment(node.vectorNetwork, onPath.segment, onPath.t) : null;
      const start = split ? split.network : node.vectorNetwork;
      if (split) refitVector(tx, node.id, start, node.transform);
      const vertex = split ? split.vertex : hit;
      editor.state.setVectorEdit({ ...state, vertices: [vertex] });
      this.handle = { kind: 'bend', tx, start, startTransform: node.transform, startInverse, down: p, moved: false, vertex, added: split !== null };
      return;
    }
    if (state.tool === 'cut') {
      const inverseCut = invert(toWorld);
      const localCut = inverseCut ? apply(inverseCut, p.world) : null;
      const nearest = hit === -1 && localCut ? nearestOnSegments(node.vectorNetwork, localCut) : null;
      const onPath = nearest && nearest.distance * Math.hypot(toWorld.a, toWorld.b) * v.zoom <= this.tolerancePx ? nearest : null;
      if (hit === -1 && !onPath) {
        editor.state.setVectorEdit({ ...state, vertices: [] });
        return;
      }
      // On a path, the cut goes through a point added there first.
      const split = onPath ? splitSegment(node.vectorNetwork, onPath.segment, onPath.t) : null;
      const result = cutVertex(split ? split.network : node.vectorNetwork, split ? split.vertex : hit);
      if (result.vertices.length > 1) editor.history.run('Cut path', (tx) => refitVector(tx, node.id, result.network));
      editor.state.setVectorEdit({ ...state, vertices: result.vertices });
      return;
    }
    if (hit !== -1) {
      const selected = p.shift ? (state.vertices.includes(hit) ? state.vertices.filter((i) => i !== hit) : [...state.vertices, hit]) : state.vertices.includes(hit) ? state.vertices : [hit];
      editor.state.setVectorEdit({ ...state, nodeId: node.id, vertices: selected });
      if (selected.includes(hit)) {
        this.drag = { tx: editor.history.begin('Move points'), start: node.vectorNetwork, startTransform: node.transform, down: p, vertices: selected, moved: false };
      }
      return;
    }
    const inverse = invert(toWorld);
    const local = inverse ? apply(inverse, p.world) : null;
    const pixelsPerUnit = Math.hypot(toWorld.a, toWorld.b) * v.zoom;
    if (local && p.clickCount >= 2) {
      const nearest = nearestOnSegments(node.vectorNetwork, local);
      if (nearest && nearest.distance * pixelsPerUnit <= this.tolerancePx) {
        const { network, vertex } = splitSegment(node.vectorNetwork, nearest.segment, nearest.t);
        editor.history.run('Add point', (tx) => refitVector(tx, node.id, network));
        editor.state.setVectorEdit({ ...state, nodeId: node.id, vertices: [vertex] });
        return;
      }
    }
    if (local && nodeContainsLocal(node, local, this.tolerancePx / pixelsPerUnit)) editor.state.setVectorEdit({ ...state, nodeId: node.id, vertices: [] });
    else endVectorEdit(editor);
  }

  pointerMove(p: PointerInfo): void {
    if (this.editor.state.getSnapshot().vectorEdit?.tool === 'paint') {
      const node = editedVector(this.editor);
      const region = node ? this.regionUnder(node, p.world) : null;
      if (this.painting) {
        if (region !== null) this.paintRegion(region);
        return;
      }
      const hover = node && region !== null ? { region, remove: paintsEqual(node.vectorNetwork.regions[region]!.fills ?? node.fills, [vectorEditPaint(this.editor)]) } : null;
      if (hover?.region !== this.hover?.region || hover?.remove !== this.hover?.remove) {
        this.hover = hover;
        this.editor.requestRender();
      }
      return;
    }
    if (this.handle) {
      this.dragHandle(this.handle, p);
      return;
    }
    if (this.lasso) {
      this.lasso.points.push({ ...p.screen });
      this.editor.requestRender();
      return;
    }
    const d = this.drag;
    const state = this.editor.state.getSnapshot().vectorEdit;
    if (!d || !state) return;
    if (!d.moved && Math.hypot(p.screen.x - d.down.screen.x, p.screen.y - d.down.screen.y) < 3) return;
    d.moved = true;
    // The drag distance in the layer's own space; its rotation and scale don't change while points move.
    const inverse = invert(this.editor.scene.worldTransform(state.nodeId));
    const worldDelta = { x: p.world.x - d.down.world.x, y: p.world.y - d.down.world.y };
    const delta = inverse ? applyLinear(inverse, worldDelta) : worldDelta;
    refitVector(d.tx, state.nodeId, moveVertices(d.start, d.vertices, delta), d.startTransform);
    d.tx.flushPreview();
    this.editor.requestRender();
  }

  pointerUp(): void {
    const painting = this.painting;
    if (painting) {
      this.painting = null;
      this.editor.history.commit(painting.tx);
      return;
    }
    const g = this.handle;
    if (g) {
      this.handle = null;
      if (g.moved || (g.kind === 'bend' && g.added)) this.editor.history.commit(g.tx);
      else this.editor.history.cancel(g.tx);
      return;
    }
    const lasso = this.lasso;
    if (lasso) {
      this.lasso = null;
      this.finishLasso(lasso);
      return;
    }
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    if (d.moved) this.editor.history.commit(d.tx);
    else this.editor.history.cancel(d.tx);
  }

  /** The region of the edited vector under a world point. */
  private regionUnder(node: VectorNode, world: Vec2): number | null {
    const inverse = invert(this.editor.scene.worldTransform(node.id));
    return inverse ? regionAt(node.vectorNetwork, apply(inverse, world)) : null;
  }

  private paintRegion(region: number): void {
    const g = this.painting;
    const state = this.editor.state.getSnapshot().vectorEdit;
    if (!g || !state || g.painted.has(region)) return;
    const node = g.tx.store.get(state.nodeId);
    if (node?.type !== 'VECTOR') return;
    g.painted.add(region);
    g.tx.set(node.id, 'vectorNetwork', setRegionFills(node.vectorNetwork, region, g.remove ? [] : [g.paint]));
    g.tx.flushPreview();
    this.editor.requestRender();
  }

  private dragHandle(g: HandleGesture, p: PointerInfo): void {
    const state = this.editor.state.getSnapshot().vectorEdit;
    if (!state) return;
    if (!g.moved && Math.hypot(p.screen.x - g.down.screen.x, p.screen.y - g.down.screen.y) < 3) return;
    g.moved = true;
    const local = apply(g.startInverse, p.world);
    let network: VectorNetwork;
    if (g.kind === 'bend') {
      const origin = g.start.vertices[g.vertex]!;
      network = bendVertex(g.start, g.vertex, { x: local.x - origin.x, y: local.y - origin.y });
    } else {
      const tangent = { x: local.x - g.origin.x, y: local.y - g.origin.y };
      network = setTangent(g.start, g.end, tangent);
      if (g.mirror) network = setTangent(network, g.mirror, { x: 0 - tangent.x, y: 0 - tangent.y });
    }
    refitVector(g.tx, state.nodeId, network, g.startTransform);
    g.tx.flushPreview();
    this.editor.requestRender();
  }

  private finishLasso(lasso: LassoDrag): void {
    const { editor } = this;
    const state = editor.state.getSnapshot().vectorEdit;
    const node = editedVector(editor);
    if (!state || !node) return;
    editor.scene.ensure(editor.pageId);
    const toWorld = editor.scene.worldTransform(node.id);
    const v = editor.state.viewport;
    // A click without an outline selects nothing.
    const inside = lasso.points.length < 3 ? [] : node.vectorNetwork.vertices.flatMap((vertex, i) => (insidePolygon(worldToScreen(v, apply(toWorld, vertex)), lasso.points) ? [i] : []));
    editor.state.setVectorEdit({ ...state, vertices: lasso.shift ? [...new Set([...state.vertices, ...inside])] : inside });
    editor.requestRender();
  }

  cancel(): boolean {
    if (this.painting) {
      this.editor.history.cancel(this.painting.tx);
      this.painting = null;
      return true;
    }
    if (this.handle) {
      this.editor.history.cancel(this.handle.tx);
      this.handle = null;
      return true;
    }
    if (this.lasso) {
      this.lasso = null;
      this.editor.requestRender();
      return true;
    }
    if (this.drag) {
      this.editor.history.cancel(this.drag.tx);
      this.drag = null;
      return true;
    }
    return endVectorEdit(this.editor);
  }
}
