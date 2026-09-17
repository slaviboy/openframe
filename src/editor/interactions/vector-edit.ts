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
import type { Rect } from '@/core/math/rect';
import type { Vec2 } from '@/core/math/vec';
import { nodeContainsLocal } from '@/core/scene/scene-index';
import { DEFAULT_SHAPE_FILL, solid } from '@/core/document/factory';
import type { HandleMirroring, Paint, Transform, VectorNode } from '@/core/schema/document';
import { cutVertex, deleteVertices, healVertices, moveVertices, nearestOnSegments, splitSegment } from '@/core/vector/vector-edit';
import { bendVertex, mirroredTangent, mirroringOf, moveHandles, oppositeEnd, setTangent, tangentAt, type SegmentEnd } from '@/core/vector/vector-bend';
import { keyBetween } from '@/core/ids/fractional-index';
import { matrixOf } from '@/core/scene/scene-index';
import { divideNetwork } from '@/core/vector/vector-divide';
import { rotatePoints, scalePoints } from '@/core/vector/vector-transform-points';
import { eraseNetwork } from '@/core/vector/vector-erase';
import { addWidthPoint, chainPointAt, nearestOnChain, snapPosition, strokeChain, widthAt, type StrokeChain, type WidthPoint } from '@/core/vector/vector-width';
import { regionAt, setRegionFills } from '@/core/vector/vector-paint';
import { networkBounds, transformNetwork, type VectorNetwork } from '@/core/vector/vector-network';
import { nextKeyAbove } from '../commands/selection-helpers';
import { paintsEqual } from '../commands/properties';
import type { Editor } from '../editor';
import { refitVector } from '../tools/vector-draw';
import type { CursorKind, PointerInfo, Tool } from '../tools/types';
import type { VectorEditTool } from '../stores/editor-store';
import { worldToScreen } from '../viewport/viewport';
import { hitHandle as hitFrameHandle, hitRotationCorner } from '../chrome/selection-geometry';
import { computeResize, type HandleId } from './transform';
import { hitHandle } from './vector-handles';
import { pointsFrame } from './vector-points-frame';

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

/** Deletes the selected width points of the vector being edited (Variable width tool), as one undo step. */
export function deleteSelectedWidthPoints(editor: Editor): boolean {
  const state = editor.state.getSnapshot().vectorEdit;
  const node = editedVector(editor);
  const selected = new Set(state?.widthPoints ?? []);
  if (!state || !node || selected.size === 0) return false;
  const rest = (node.strokeWidths ?? []).filter((_, i) => !selected.has(i));
  editor.history.run('Delete width points', (tx) => tx.set(node.id, 'strokeWidths', rest.length > 0 ? rest : undefined));
  editor.state.setVectorEdit({ ...state, widthPoints: [] });
  return true;
}

/** Screen distance a width point's knobs keep from the path at least, so thin strokes stay easy to widen. */
export const WIDTH_KNOB_MIN_PX = 12;

/** The Eraser's weight in canvas units: the one set for it, else 10. */
export const eraserWeight = (editor: Editor): number => editor.state.getSnapshot().vectorEdit?.eraserWeight ?? 10;

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
  | {
      readonly kind: 'handle';
      readonly end: SegmentEnd;
      readonly origin: { readonly x: number; readonly y: number };
      /** The handle across the point that follows this one, and how it follows. */
      readonly mirror: SegmentEnd | null;
      readonly mirroring: HandleMirroring;
    }
  | { readonly kind: 'handles'; readonly ends: readonly SegmentEnd[] }
);

/** Painting regions: the paint set on (or, when the first region already showed it, removed from) each region the drag crosses. */
interface PaintDrag {
  readonly tx: Transaction;
  readonly paint: Paint;
  readonly remove: boolean;
  readonly painted: Set<number>;
}

/** Erasing: the eraser's path so far, in the space of the network the drag started from, and on screen for the overlay. */
interface EraseDrag {
  readonly tx: Transaction;
  readonly start: VectorNetwork;
  readonly startTransform: Transform;
  readonly startInverse: Matrix;
  /** The eraser's weight in the network's space. */
  readonly weight: number;
  readonly path: Vec2[];
  readonly screen: Vec2[];
  readonly screenWidth: number;
  erased: boolean;
}

/** Dragging with the Variable width tool: a width point's knob (its width) or the point itself (along the path). */
interface WidthDrag {
  readonly tx: Transaction;
  readonly kind: 'width' | 'move';
  readonly index: number;
  readonly start: readonly WidthPoint[];
  /** World to layer space, and screen pixels per layer unit, when the drag started. */
  readonly inverse: Matrix;
  readonly pxPerUnit: number;
  readonly down: PointerInfo;
  moved: boolean;
}

/** A press with the Cut tool: a click cuts at a point, a drag cuts along the line from the press. */
interface CutDrag {
  readonly down: PointerInfo;
  current: PointerInfo;
}

/** Resizing or rotating the selected points with their bounding box. */
type BoxDrag = {
  readonly tx: Transaction;
  readonly start: VectorNetwork;
  readonly startTransform: Transform;
  /** World to layer space when the drag started. */
  readonly inverse: Matrix;
  /** The box around the points, in layer space. */
  readonly box: Rect;
  readonly vertices: readonly number[];
  readonly startLocal: Vec2;
  readonly down: PointerInfo;
  moved: boolean;
} & ({ readonly kind: 'resize'; readonly handle: HandleId } | { readonly kind: 'rotate' });

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
 * With Cut (X), clicking a point or a path breaks the path there, leaving its ends selected; dragging across paths
 * cuts them along the line, and the pieces that come apart move to layers of their own.
 * With two or more points selected, their bounding box resizes them (Shift keeps proportions, Alt resizes from the
 * center) or, dragged from just outside a corner, rotates them (Shift snaps to 15°).
 * With Bend, pressing on a point (or a path, adding a point) and dragging pulls out mirrored handles.
 * The handles of selected points can be dragged; handles that mirrored each other keep mirroring. Shift-click selects
 * several handles, and dragging one of them moves them all together.
 * With Paint (⇧B), clicking a closed region fills it with the paint, or removes a fill that already matches it; a drag paints every region it crosses.
 * With the Eraser (⇧E), a drag removes the area it passes over: open paths are clipped and closed regions lose that area.
 * With Variable width, clicking the stroke adds a width point; dragging a knob sets its width, dragging the point moves it along the path.
 */
export class VectorEditController implements Tool {
  readonly id = 'move' as const;
  private drag: PointDrag | null = null;
  private lasso: LassoDrag | null = null;
  private handle: HandleGesture | null = null;
  private painting: PaintDrag | null = null;
  private erasing: EraseDrag | null = null;
  private widthDrag: WidthDrag | null = null;
  private cutDrag: CutDrag | null = null;
  private boxDrag: BoxDrag | null = null;
  private widthHover: Vec2 | null = null;
  private hover: { readonly region: number; readonly remove: boolean } | null = null;

  constructor(
    private readonly editor: Editor,
    private readonly tolerancePx: number,
  ) {}

  get active(): boolean {
    return (
      this.drag !== null || this.lasso !== null || this.handle !== null || this.painting !== null || this.erasing !== null || this.widthDrag !== null || this.cutDrag !== null || this.boxDrag !== null
    );
  }

  /** Screen outline of the lasso being drawn, for the overlay. */
  get lassoPath(): readonly Vec2[] | null {
    return this.lasso?.points ?? null;
  }

  /** The region under the pointer with the Paint tool, and whether a click there removes its fill. */
  get paintHover(): { readonly region: number; readonly remove: boolean } | null {
    return this.editor.state.getSnapshot().vectorEdit?.tool === 'paint' ? this.hover : null;
  }

  /** The cut line on screen while dragging the Cut tool. */
  get cutLine(): readonly [Vec2, Vec2] | null {
    const g = this.cutDrag;
    return g && this.cutMoved(g) ? [g.down.screen, g.current.screen] : null;
  }

  /** Where a click would add a width point (screen), while the Variable width tool hovers the stroke. */
  get widthHoverPoint(): Vec2 | null {
    return this.editor.state.getSnapshot().vectorEdit?.tool === 'width' && !this.widthDrag ? this.widthHover : null;
  }

  /** The eraser's path on screen and its width there, while erasing. */
  get eraserTrail(): { readonly points: readonly Vec2[]; readonly width: number } | null {
    return this.erasing ? { points: this.erasing.screen, width: this.erasing.screenWidth } : null;
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
    if (state.tool === 'width') {
      const widthInverse = invert(toWorld);
      const chain = strokeChain(node.vectorNetwork);
      if (!widthInverse || !chain || node.strokeDashes) return;
      const local = apply(widthInverse, p.world);
      const pxPerUnit = Math.hypot(toWorld.a, toWorld.b) * v.zoom || 1;
      const points = node.strokeWidths ?? [];
      const tolerance = this.tolerancePx / pxPerUnit;
      const hitPoint = this.hitWidthPoint(chain, points, local, tolerance, WIDTH_KNOB_MIN_PX / pxPerUnit);
      if (hitPoint) {
        const current = state.widthPoints ?? [];
        const widthPoints = p.shift
          ? current.includes(hitPoint.index)
            ? current.filter((i) => i !== hitPoint.index)
            : [...current, hitPoint.index]
          : current.includes(hitPoint.index)
            ? current
            : [hitPoint.index];
        editor.state.setVectorEdit({ ...state, widthPoints });
        const label = hitPoint.kind === 'width' ? 'Change stroke width' : 'Move width point';
        this.widthDrag = { tx: editor.history.begin(label), kind: hitPoint.kind, index: hitPoint.index, start: points, inverse: widthInverse, pxPerUnit, down: p, moved: false };
        return;
      }
      const nearest = nearestOnChain(chain, local);
      if (nearest.distance > Math.max(tolerance, widthAt(points, nearest.position, node.strokeWeight) / 2)) {
        editor.state.setVectorEdit({ ...state, widthPoints: [] });
        return;
      }
      // Ctrl places the point exactly under the pointer, without snapping.
      const total = chain.lengths[chain.lengths.length - 1]!;
      const position = p.ctrl ? nearest.position : snapPosition(chain, points, nearest.position, tolerance / total);
      const added = addWidthPoint(points, position, widthAt(points, position, node.strokeWeight));
      editor.history.run('Add width point', (tx) => tx.set(node.id, 'strokeWidths', added.points));
      editor.state.setVectorEdit({ ...state, widthPoints: [added.index] });
      return;
    }
    if (state.tool === 'eraser') {
      const eraseInverse = invert(toWorld);
      if (!eraseInverse || !editor.geometry) return;
      const weight = eraserWeight(editor);
      this.erasing = {
        tx: editor.history.begin('Erase'),
        start: node.vectorNetwork,
        startTransform: node.transform,
        startInverse: eraseInverse,
        weight: weight / (Math.hypot(toWorld.a, toWorld.b) || 1),
        path: [],
        screen: [],
        screenWidth: weight * v.zoom,
        erased: false,
      };
      this.erase(p);
      return;
    }
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
      const chosen = state.selectedHandles ?? [];
      const isChosen = chosen.some((e) => e.segment === handle.end.segment && e.side === handle.end.side);
      if (p.shift) {
        // Shift-click selects handles to move together.
        const selectedHandles = isChosen ? chosen.filter((e) => e.segment !== handle.end.segment || e.side !== handle.end.side) : [...chosen, handle.end];
        editor.state.setVectorEdit({ ...state, selectedHandles });
        return;
      }
      if (isChosen && chosen.length > 1) {
        this.handle = { kind: 'handles', tx: editor.history.begin('Move handles'), start: node.vectorNetwork, startTransform: node.transform, startInverse, down: p, moved: false, ends: chosen };
        return;
      }
      const network = node.vectorNetwork;
      // The point's own mirroring says whether the handle opposite this one follows it, and how.
      const mode = mirroringOf(network, handle.vertex);
      const opposite = mode === 'NONE' ? null : oppositeEnd(network, handle.end);
      const tx = editor.history.begin('Move handle');
      this.handle = {
        kind: 'handle',
        tx,
        start: network,
        startTransform: node.transform,
        startInverse,
        down: p,
        moved: false,
        end: handle.end,
        origin: network.vertices[handle.vertex]!,
        mirror: opposite,
        mirroring: mode,
      };
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
    if (state.tool === 'cut' && !this.cutDrag) {
      this.cutDrag = { down: p, current: p };
      return;
    }
    if (state.tool === 'cut') {
      this.cutDrag = null;
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
    // The selected points' box: points under the pointer come first, so they stay easy to drag.
    const points = hit === -1 && (state.tool ?? 'move') === 'move' ? pointsFrame(editor) : null;
    if (points) {
      const frameHandle = hitFrameHandle(editor, points.frame, p.screen, this.tolerancePx);
      const corner = frameHandle ? null : hitRotationCorner(editor, points.frame, p.screen, this.tolerancePx);
      const boxInverse = invert(toWorld);
      if ((frameHandle || corner) && boxInverse) {
        const common = {
          tx: editor.history.begin(frameHandle ? 'Resize points' : 'Rotate points'),
          start: node.vectorNetwork,
          startTransform: node.transform,
          inverse: boxInverse,
          box: points.box,
          vertices: state.vertices,
          startLocal: apply(boxInverse, p.world),
          down: p,
          moved: false,
        };
        this.boxDrag = frameHandle ? { ...common, kind: 'resize', handle: frameHandle } : { ...common, kind: 'rotate' };
        return;
      }
    }
    if (hit !== -1) {
      const selected = p.shift ? (state.vertices.includes(hit) ? state.vertices.filter((i) => i !== hit) : [...state.vertices, hit]) : state.vertices.includes(hit) ? state.vertices : [hit];
      editor.state.setVectorEdit({ ...state, nodeId: node.id, vertices: selected, ...(state.selectedHandles?.length ? { selectedHandles: [] } : {}) });
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
    if (this.boxDrag) {
      this.dragBox(this.boxDrag, p);
      return;
    }
    if (this.cutDrag) {
      this.cutDrag.current = p;
      if (this.cutMoved(this.cutDrag)) this.editor.requestRender();
      return;
    }
    if (this.widthDrag) {
      this.dragWidth(this.widthDrag, p);
      return;
    }
    if (this.editor.state.getSnapshot().vectorEdit?.tool === 'width') {
      this.hoverWidth(p);
      return;
    }
    if (this.erasing) {
      this.erase(p);
      return;
    }
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
    const boxDrag = this.boxDrag;
    if (boxDrag) {
      this.boxDrag = null;
      if (boxDrag.moved) this.editor.history.commit(boxDrag.tx);
      else this.editor.history.cancel(boxDrag.tx);
      return;
    }
    const cutDrag = this.cutDrag;
    if (cutDrag) {
      if (this.cutMoved(cutDrag)) {
        this.cutDrag = null;
        this.divide(cutDrag);
      } else {
        // A click: cut at the point pressed (the Cut branch of pointerDown, now that the press is over).
        this.pointerDown(cutDrag.down);
      }
      this.editor.requestRender();
      return;
    }
    const widthDrag = this.widthDrag;
    if (widthDrag) {
      this.widthDrag = null;
      if (widthDrag.moved) this.editor.history.commit(widthDrag.tx);
      else this.editor.history.cancel(widthDrag.tx);
      return;
    }
    const erasing = this.erasing;
    if (erasing) {
      this.erasing = null;
      if (erasing.erased) this.editor.history.commit(erasing.tx);
      else this.editor.history.cancel(erasing.tx);
      this.editor.requestRender();
      return;
    }
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

  /** Resizes the selected points with their box (Shift keeps proportions, Alt from the center) or rotates them about its center (Shift snaps to 15°). */
  private dragBox(g: BoxDrag, p: PointerInfo): void {
    const state = this.editor.state.getSnapshot().vectorEdit;
    if (!state) return;
    if (!g.moved && Math.hypot(p.screen.x - g.down.screen.x, p.screen.y - g.down.screen.y) < 3) return;
    g.moved = true;
    const local = apply(g.inverse, p.world);
    let network: VectorNetwork;
    if (g.kind === 'resize') {
      const edges = computeResize({ box: g.box, handle: g.handle, pointer: local, start: g.startLocal, keepAspect: p.shift, fromCenter: p.alt });
      network = scalePoints(g.start, g.vertices, g.box, edges);
    } else {
      const pivot = { x: g.box.x + g.box.width / 2, y: g.box.y + g.box.height / 2 };
      let angle = Math.atan2(local.y - pivot.y, local.x - pivot.x) - Math.atan2(g.startLocal.y - pivot.y, g.startLocal.x - pivot.x);
      if (p.shift) angle = Math.round(angle / (Math.PI / 12)) * (Math.PI / 12);
      network = rotatePoints(g.start, g.vertices, pivot, angle);
    }
    refitVector(g.tx, state.nodeId, network, g.startTransform);
    g.tx.flushPreview();
    this.editor.requestRender();
  }

  private cutMoved(g: CutDrag): boolean {
    return Math.hypot(g.current.screen.x - g.down.screen.x, g.current.screen.y - g.down.screen.y) >= 3;
  }

  /**
   * Divides the edited vector along a Cut drag: the path is cut where the line crosses it, the piece with
   * the first point stays in the layer, and each other piece becomes a vector layer of its own directly
   * above, with the same name and appearance; one undo step.
   */
  private divide(g: CutDrag): void {
    const { editor } = this;
    const state = editor.state.getSnapshot().vectorEdit;
    const node = editedVector(editor);
    if (!state || !node) return;
    const inverse = invert(editor.scene.worldTransform(node.id));
    if (!inverse) return;
    // Filled regions the drag crosses are split with the engine's path operations; without it their outlines are cut open.
    const geometry = editor.geometry;
    const pieces = divideNetwork(node.vectorNetwork, apply(inverse, g.down.world), apply(inverse, g.current.world), (n, region, from, to) =>
      geometry ? geometry.regionHalves(n, region, from, to) : null,
    );
    const [kept, ...divided] = pieces ?? [];
    if (!kept) return;
    editor.history.run('Divide path', (tx) => {
      refitVector(tx, node.id, kept);
      // Width points were placed along the whole path; the pieces start without them.
      if (node.strokeWidths) tx.set(node.id, 'strokeWidths', undefined);
      let below = node.id;
      for (const piece of divided) {
        const bounds = networkBounds(piece) ?? { x: 0, y: 0, width: 0, height: 0 };
        const offset = applyLinear(matrixOf(node.transform), { x: bounds.x, y: bounds.y });
        const t = node.transform;
        const id = editor.ids.next();
        const key = keyBetween((tx.store.getOrThrow(below) as VectorNode).parent.key, nextKeyAbove(tx.store, below));
        tx.create({
          ...node,
          id,
          parent: { id: node.parent.id, key },
          transform: [t[0], t[1], t[2], t[3], t[4] + offset.x, t[5] + offset.y],
          size: { width: bounds.width, height: bounds.height },
          vectorNetwork: transformNetwork(piece, { x: bounds.x, y: bounds.y }, 1, 1),
        } as VectorNode);
        if (node.strokeWidths) tx.set(id, 'strokeWidths', undefined);
        below = id;
      }
    });
    editor.state.setVectorEdit({ ...state, vertices: [], widthPoints: [] });
  }

  /** The width point under a layer-space point: one of its knobs (to change its width) or the point on the path (to move it). */
  private hitWidthPoint(chain: StrokeChain, points: readonly WidthPoint[], local: Vec2, tolerance: number, minReach: number): { index: number; kind: 'width' | 'move' } | null {
    for (let i = points.length - 1; i >= 0; i--) {
      const { point, normal } = chainPointAt(chain, points[i]!.position);
      const reach = Math.max(points[i]!.width / 2, minReach);
      for (const side of [1, -1]) {
        if (Math.hypot(local.x - (point.x + normal.x * reach * side), local.y - (point.y + normal.y * reach * side)) <= tolerance) return { index: i, kind: 'width' };
      }
      if (Math.hypot(local.x - point.x, local.y - point.y) <= tolerance) return { index: i, kind: 'move' };
    }
    return null;
  }

  private dragWidth(g: WidthDrag, p: PointerInfo): void {
    const node = editedVector(this.editor);
    const chain = node ? strokeChain(node.vectorNetwork) : null;
    const current = g.start[g.index];
    if (!node || !chain || !current) return;
    if (!g.moved && Math.hypot(p.screen.x - g.down.screen.x, p.screen.y - g.down.screen.y) < 3) return;
    g.moved = true;
    const local = apply(g.inverse, p.world);
    let next: WidthPoint;
    if (g.kind === 'width') {
      // The width follows the pointer's distance from the path at the point, on either side.
      const { point } = chainPointAt(chain, current.position);
      next = { ...current, width: Math.round(Math.hypot(local.x - point.x, local.y - point.y) * 200) / 100 };
    } else {
      const nearest = nearestOnChain(chain, local);
      const others = g.start.filter((_, i) => i !== g.index);
      const total = chain.lengths[chain.lengths.length - 1]!;
      next = { ...current, position: p.ctrl ? nearest.position : snapPosition(chain, others, nearest.position, this.tolerancePx / g.pxPerUnit / total) };
    }
    g.tx.set(
      node.id,
      'strokeWidths',
      g.start.map((w, i) => (i === g.index ? next : w)),
    );
    g.tx.flushPreview();
    this.editor.requestRender();
  }

  private hoverWidth(p: PointerInfo): void {
    const node = editedVector(this.editor);
    const chain = node ? strokeChain(node.vectorNetwork) : null;
    let next: Vec2 | null = null;
    if (node && chain && !node.strokeDashes) {
      const toWorld = this.editor.scene.worldTransform(node.id);
      const inverse = invert(toWorld);
      const pxPerUnit = Math.hypot(toWorld.a, toWorld.b) * this.editor.state.viewport.zoom || 1;
      if (inverse) {
        const nearest = nearestOnChain(chain, apply(inverse, p.world));
        const reach = Math.max(this.tolerancePx / pxPerUnit, widthAt(node.strokeWidths ?? [], nearest.position, node.strokeWeight) / 2);
        if (nearest.distance <= reach) next = worldToScreen(this.editor.state.viewport, apply(toWorld, nearest.point));
      }
    }
    if (next?.x !== this.widthHover?.x || next?.y !== this.widthHover?.y) {
      this.widthHover = next;
      this.editor.requestRender();
    }
  }

  /** Extends the eraser's path to the pointer and erases along the whole path from the starting network. */
  private erase(p: PointerInfo): void {
    const g = this.erasing;
    const state = this.editor.state.getSnapshot().vectorEdit;
    const geometry = this.editor.geometry;
    if (!g || !state || !geometry) return;
    g.path.push(apply(g.startInverse, p.world));
    g.screen.push({ ...p.screen });
    const network = eraseNetwork(g.start, g.path, g.weight, (n, region, path, weight) => geometry.regionMinusStroke(n, region, path, weight));
    g.erased = network !== g.start;
    refitVector(g.tx, state.nodeId, network, g.startTransform);
    g.tx.flushPreview();
    this.editor.requestRender();
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
    } else if (g.kind === 'handles') {
      // Every selected handle copies the movement from the press.
      const pressed = apply(g.startInverse, g.down.world);
      network = moveHandles(g.start, g.ends, { x: local.x - pressed.x, y: local.y - pressed.y });
    } else {
      const tangent = { x: local.x - g.origin.x, y: local.y - g.origin.y };
      network = setTangent(g.start, g.end, tangent);
      if (g.mirror) {
        const followed = mirroredTangent(g.mirroring, tangent, tangentAt(g.start, g.mirror));
        if (followed) network = setTangent(network, g.mirror, followed);
      }
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
    if (this.boxDrag) {
      this.editor.history.cancel(this.boxDrag.tx);
      this.boxDrag = null;
      return true;
    }
    if (this.cutDrag) {
      this.cutDrag = null;
      this.editor.requestRender();
      return true;
    }
    if (this.widthDrag) {
      this.editor.history.cancel(this.widthDrag.tx);
      this.widthDrag = null;
      return true;
    }
    if (this.erasing) {
      this.editor.history.cancel(this.erasing.tx);
      this.erasing = null;
      this.editor.requestRender();
      return true;
    }
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
