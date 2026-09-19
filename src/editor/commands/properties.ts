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

import type { DocumentStore } from '@/core/document/store';
import type { Transaction } from '@/core/history/history';
import type { Id } from '@/core/ids/ids';
import { apply, determinant, multiply, rotation, scaling, type Matrix } from '@/core/math/matrix';
import { matrixOf } from '@/core/scene/scene-index';
import type { Constraint, LayoutGuide } from '@/core/schema/document';
import {
  DEFAULT_MITER_ANGLE,
  type DynamicStroke,
  hasGeometry,
  isSceneNode,
  type BlendMode,
  type CornerRadii,
  type DashCap,
  type Effect,
  type IndividualStrokeWeights,
  type Paint,
  type SceneNode,
  type StrokeAlign,
  type StrokeCap,
  type StrokeJoin,
} from '@/core/schema/document';
import { openEnds, pathEnds } from '@/core/vector/vector-caps';
import { flipWidthPoints, profileWidthPoints, strokeChain } from '@/core/vector/vector-width';
import { matrixRotationDegrees, roundTransform, toTransform } from '../interactions/transform';

export const MIXED = Symbol('mixed');
export type Mixed<T> = T | typeof MIXED;

/** Shared value across nodes, or MIXED when they differ (compared with `equals`). */
export function shared<N, T>(nodes: readonly N[], get: (n: N) => T, equals: (a: T, b: T) => boolean = Object.is): Mixed<T> | undefined {
  if (nodes.length === 0) return undefined;
  const first = get(nodes[0]!);
  for (let i = 1; i < nodes.length; i++) if (!equals(first, get(nodes[i]!))) return MIXED;
  return first;
}

export const sceneNodes = (store: DocumentStore, ids: readonly Id[]): SceneNode[] =>
  ids.map((id) => store.get(id)).filter((n): n is SceneNode => n !== undefined && isSceneNode(n));

/** Rotation shown in the inspector: degrees, counterclockwise positive, in (-180, 180]. */
export const rotationDegrees = (node: SceneNode): number => matrixRotationDegrees(matrixOf(node.transform));

export function setPosition(tx: Transaction, node: SceneNode, axis: 'x' | 'y', value: number): void {
  const t = [...node.transform] as [number, number, number, number, number, number];
  t[axis === 'x' ? 4 : 5] = value;
  tx.set(node.id, 'transform', t);
}

export function setSize(tx: Transaction, node: SceneNode, axis: 'width' | 'height', value: number): void {
  const current = tx.store.getOrThrow(node.id) as SceneNode;
  // Lines have no height; their thickness is the stroke weight.
  if (current.type === 'LINE' && axis === 'height') return;
  // Typing a width wraps auto-width text (auto height); typing a height fixes the text box.
  if (current.type === 'TEXT') {
    const mode = resizedTextMode(current.textAutoResize, { width: axis === 'width', height: axis === 'height' });
    if (mode !== current.textAutoResize) tx.set(node.id, 'textAutoResize', mode);
  }
  // A typed size makes hug or fill layers fixed on that axis.
  const sizingField = axis === 'width' ? 'layoutSizingHorizontal' : 'layoutSizingVertical';
  if (current[sizingField]) tx.set(node.id, sizingField, undefined);
  const next = Math.max(0, value);
  const other = axis === 'width' ? 'height' : 'width';
  if (current.constrainProportions && current.type !== 'LINE' && current.size[axis] > 0) {
    // Constrained layers scale the other dimension by the same factor.
    const scaled = Math.round(((current.size[other] * next) / current.size[axis]) * 100) / 100;
    tx.set(node.id, 'size', { [axis]: next, [other]: scaled } as { width: number; height: number });
    return;
  }
  tx.set(node.id, 'size', { ...current.size, [axis]: next });
}

/** Sets a layer's constraint on one axis (stored only when not the default, left and top). */
export function setConstraint(tx: Transaction, node: SceneNode, axis: 'horizontal' | 'vertical', value: Constraint): void {
  const current = (tx.store.getOrThrow(node.id) as SceneNode).constraints ?? { horizontal: 'MIN', vertical: 'MIN' };
  const next = { ...current, [axis]: value };
  tx.set(node.id, 'constraints', next.horizontal === 'MIN' && next.vertical === 'MIN' ? undefined : next);
}

/** Turns constrain proportions on or off (stored only while on). */
export function setConstrainProportions(tx: Transaction, node: SceneNode, on: boolean): void {
  if (node.type === 'LINE') return;
  tx.set(node.id, 'constrainProportions', on ? true : undefined);
}

/** The point a layer turns and scales around, in its own coordinates: its anchor, or the middle of it. */
export function anchorPoint(node: SceneNode): { x: number; y: number } {
  const share = node.anchor ?? { x: 0.5, y: 0.5 };
  return { x: node.size.width * share.x, y: node.size.height * share.y };
}

/** Sets rotation around the layer's anchor point (its middle unless one is set), preserving any flip. */
export function setRotation(tx: Transaction, node: SceneNode, degrees: number): void {
  const current = tx.store.getOrThrow(node.id) as SceneNode;
  if (current.type === 'SECTION') return;
  const m = matrixOf(current.transform);
  const flipX = determinant(m) < 0;
  const half = anchorPoint(current);
  const center = apply(m, half);
  const linear: Matrix = multiply(rotation((-degrees * Math.PI) / 180), scaling(flipX ? -1 : 1, 1));
  const offset = apply(linear, half);
  const next: Matrix = { ...linear, e: center.x - offset.x, f: center.y - offset.y };
  tx.set(node.id, 'transform', toTransform(Math.abs(degrees % 90) < 1e-9 ? roundTransform(next) : next));
}

export function setOpacity(tx: Transaction, node: SceneNode, percent: number): void {
  tx.set(node.id, 'opacity', Math.min(1, Math.max(0, percent / 100)));
}

/** Layer blend mode (pass through is the layer default). */
export function setBlendMode(tx: Transaction, node: SceneNode, mode: BlendMode): void {
  tx.set(node.id, 'blendMode', mode);
}

import { resizedTextMode } from './text';

/** Uniform corner radius for frames, rectangles, polygons and stars (clears independent corners). */
export function setCornerRadius(tx: Transaction, node: SceneNode, radius: number): void {
  const r = Math.max(0, radius);
  if (node.type === 'POLYGON' || node.type === 'STAR') {
    tx.set(node.id, 'cornerRadius', r > 0 ? r : undefined);
    return;
  }
  if (node.type !== 'FRAME' && node.type !== 'RECTANGLE') return;
  tx.set(node.id, 'cornerRadius', r);
  if (node.cornerRadii) tx.set(node.id, 'cornerRadii', undefined);
}

/**
 * Independent corner radii for frames and rectangles. `undefined` returns to a uniform radius
 * (the largest corner); equal corners collapse into `cornerRadius`.
 */
export function setCornerRadii(tx: Transaction, node: SceneNode, radii: CornerRadii | undefined): void {
  if (node.type !== 'FRAME' && node.type !== 'RECTANGLE') return;
  const current = tx.store.getOrThrow(node.id) as typeof node;
  if (!radii) {
    const r = current.cornerRadii;
    if (r) tx.set(node.id, 'cornerRadius', Math.max(r.topLeft, r.topRight, r.bottomRight, r.bottomLeft));
    tx.set(node.id, 'cornerRadii', undefined);
    return;
  }
  const clean = (v: number) => Math.max(0, Math.round(v * 100) / 100);
  const next = { topLeft: clean(radii.topLeft), topRight: clean(radii.topRight), bottomRight: clean(radii.bottomRight), bottomLeft: clean(radii.bottomLeft) };
  tx.set(node.id, 'cornerRadii', next);
}

/** Corner smoothing in percent (0–100) for frames, rectangles, polygons and stars; 0 removes it. */
export function setCornerSmoothing(tx: Transaction, node: SceneNode, percent: number): void {
  if (node.type !== 'FRAME' && node.type !== 'RECTANGLE' && node.type !== 'POLYGON' && node.type !== 'STAR') return;
  const value = Math.round(Math.min(100, Math.max(0, percent))) / 100;
  tx.set(node.id, 'cornerSmoothing', value > 0 ? value : undefined);
}

/** Polygon sides or star points, clamped to 3–60. */
export function setPointCount(tx: Transaction, node: SceneNode, count: number): void {
  if (node.type !== 'POLYGON' && node.type !== 'STAR') return;
  tx.set(node.id, 'pointCount', Math.min(60, Math.max(3, Math.round(count))));
}

/** Star inner radius ratio as a percentage (0–100). */
export function setInnerRadius(tx: Transaction, node: SceneNode, percent: number): void {
  if (node.type !== 'STAR') return;
  tx.set(node.id, 'innerRadius', Math.min(1, Math.max(0, percent / 100)));
}

/**
 * The end point one end of a path draws. A line has its own two ends; a vector layer keeps the cap on the
 * point the path stops at, so each end of it can end its own way — which is what the reference sets from the
 * Start point and End point controls, and per point in vector edit mode.
 */
export function setEndCap(tx: Transaction, node: SceneNode, end: 'startCap' | 'endCap', cap: StrokeCap): void {
  if (node.type === 'LINE') {
    tx.set(node.id, end, cap);
    return;
  }
  if (node.type !== 'VECTOR') return;
  const network = (tx.store.getOrThrow(node.id) as typeof node).vectorNetwork;
  const ends = pathEnds(network);
  const vertex = end === 'startCap' ? ends?.start.vertex : ends?.end.vertex;
  // A network that is not one open path has no start and end of its own: every end takes the same cap.
  if (vertex === undefined) {
    setAllEndCaps(tx, node, cap);
    return;
  }
  setVertexCaps(tx, node, [vertex], cap);
}

/** The end point every open end of a vector layer draws, clearing the ones that had their own. */
export function setAllEndCaps(tx: Transaction, node: SceneNode, cap: StrokeCap): void {
  if (node.type !== 'VECTOR') return;
  const network = (tx.store.getOrThrow(node.id) as typeof node).vectorNetwork;
  tx.set(node.id, 'endpointCap', cap === 'NONE' ? undefined : cap);
  if (network.vertices.some((vertex) => vertex.cap !== undefined))
    tx.set(node.id, 'vectorNetwork', { ...network, vertices: network.vertices.map(({ cap: _cap, ...vertex }) => vertex) });
}

/** The end point the named points of a vector layer draw — the ends picked in vector edit mode. */
export function setVertexCaps(tx: Transaction, node: SceneNode, vertices: readonly number[], cap: StrokeCap): void {
  if (node.type !== 'VECTOR' || vertices.length === 0) return;
  const network = (tx.store.getOrThrow(node.id) as typeof node).vectorNetwork;
  const chosen = new Set(vertices);
  tx.set(node.id, 'vectorNetwork', {
    ...network,
    vertices: network.vertices.map((vertex, i) => (chosen.has(i) ? { ...vertex, cap } : vertex)),
  });
}

/** Replaces a layer's effects (stored only when there are any). */
export function setEffects(tx: Transaction, node: SceneNode, effects: readonly Effect[]): void {
  tx.set(node.id, 'effects', effects.length > 0 ? [...effects] : undefined);
}

/** Replaces a frame's layout guides; the field is removed when none are left. */
export function setLayoutGuides(tx: Transaction, node: SceneNode, guides: readonly LayoutGuide[]): void {
  if (node.type === 'FRAME') tx.set(node.id, 'layoutGuides', guides.length > 0 ? guides : undefined);
}

export type PaintField = 'fills' | 'strokes';

export function setPaints(tx: Transaction, node: SceneNode, field: PaintField, paints: readonly Paint[]): void {
  if (!hasGeometry(node)) return;
  tx.set(node.id, field, paints);
}

export function updatePaint(tx: Transaction, node: SceneNode, field: PaintField, index: number, patch: Partial<Paint>): void {
  if (!hasGeometry(node)) return;
  const current = (tx.store.getOrThrow(node.id) as typeof node)[field];
  if (index < 0 || index >= current.length) return;
  tx.set(node.id, field, current.map((p, i) => (i === index ? ({ ...p, ...patch } as Paint) : p)));
}

export function setStrokeWeight(tx: Transaction, node: SceneNode, weight: number): void {
  if (hasGeometry(node)) tx.set(node.id, 'strokeWeight', Math.max(0, weight));
}

export function setStrokeAlign(tx: Transaction, node: SceneNode, align: StrokeAlign): void {
  if (hasGeometry(node)) tx.set(node.id, 'strokeAlign', align);
}

/** Dash pattern (alternating dash and gap lengths), or undefined for a solid stroke. Needs a positive total length. */
export function setStrokeDashes(tx: Transaction, node: SceneNode, dashes: readonly number[] | undefined): void {
  if (!hasGeometry(node)) return;
  const valid = dashes && dashes.length >= 2 && dashes.length % 2 === 0 && dashes.every((d) => Number.isFinite(d) && d >= 0) && dashes.some((d) => d > 0);
  tx.set(node.id, 'strokeDashes', valid ? dashes.map((d) => Math.round(d * 100) / 100) : undefined);
}

export function setDashCap(tx: Transaction, node: SceneNode, cap: DashCap): void {
  if (hasGeometry(node)) tx.set(node.id, 'strokeCap', cap === 'NONE' ? undefined : cap);
}

export function setStrokeJoin(tx: Transaction, node: SceneNode, join: StrokeJoin): void {
  if (hasGeometry(node)) tx.set(node.id, 'strokeJoin', join === 'MITER' ? undefined : join);
}

/** Miter angle in degrees (clamped to 0–180); the default is stored as absent. */
export function setStrokeMiterAngle(tx: Transaction, node: SceneNode, degrees: number): void {
  if (!hasGeometry(node)) return;
  const angle = Math.min(180, Math.max(0, Math.round(degrees * 100) / 100));
  tx.set(node.id, 'strokeMiterAngle', angle === DEFAULT_MITER_ANGLE ? undefined : angle);
}

/**
 * Whether a path's ends can be given end points. A line always has its two; a vector path needs an open end,
 * and a stroke drawn as an area — a brush, or a width that varies — ends in the shape it is drawn as, which
 * is why the reference's table says a width profile takes an arrowhead off. A dashed stroke ends its dashes
 * with their own cap.
 */
export function canTakeEndPoints(node: SceneNode): boolean {
  if (node.type === 'LINE') return true;
  if (node.type !== 'VECTOR') return false;
  return !node.strokeDashes && !node.strokeWidths?.length && node.brushId === undefined && openEnds(node.vectorNetwork).length > 0;
}

/**
 * Whether a stroke can be given a width profile. The documentation names what cannot: a vector network whose
 * path branches, and a dynamic or dashed stroke. A brush paints the stroke as its own shape, which leaves no
 * width to vary, and only a vector layer carries width points at all.
 */
export function canTakeWidthProfile(node: SceneNode): boolean {
  return node.type === 'VECTOR' && !node.strokeDashes && !node.dynamicStroke && node.brushId === undefined && strokeChain(node.vectorNetwork) !== null;
}

/**
 * Lays a width profile down along a stroke, as shares of the stroke's own weight; the uniform profile clears
 * the width points again. A stroke whose width varies ends in the shape it tapers to, so laying a profile down
 * takes the end points off — which is what the reference's own table of supported properties says.
 */
export function setWidthProfile(tx: Transaction, node: SceneNode, profileId: string): void {
  if (!canTakeWidthProfile(node)) return;
  const live = tx.store.getOrThrow(node.id) as Extract<SceneNode, { type: 'VECTOR' }>;
  const points = profileWidthPoints(profileId, live.strokeWeight);
  tx.set(node.id, 'strokeWidths', points.length > 0 ? points : undefined);
  if (points.length > 0) setAllEndCaps(tx, live, 'NONE');
}

/** Flip width points: the stroke's width read back along the path the other way. */
export function flipStrokeWidths(tx: Transaction, node: SceneNode): void {
  if (node.type !== 'VECTOR') return;
  const points = (tx.store.getOrThrow(node.id) as typeof node).strokeWidths;
  if (points?.length) tx.set(node.id, 'strokeWidths', flipWidthPoints(points));
}

/**
 * A layer's dynamic stroke — the hand-drawn, bumpy look. Turning it on centers the stroke, which is the only position
 * a dynamic stroke takes; `undefined` turns it off again.
 */
export function setDynamicStroke(tx: Transaction, node: SceneNode, dynamic: DynamicStroke | undefined): void {
  if (!hasGeometry(node)) return;
  const clamp = (v: number) => Math.min(100, Math.max(0, Math.round(v)));
  tx.set(node.id, 'dynamicStroke', dynamic ? { frequency: clamp(dynamic.frequency), wiggle: clamp(dynamic.wiggle), smoothen: clamp(dynamic.smoothen) } : undefined);
  if (dynamic) tx.set(node.id, 'strokeAlign', 'CENTER');
}

/**
 * Per-side stroke weights for frames and rectangles. Equal sides collapse back into
 * `strokeWeight` (and clear the per-side field).
 */
export function setIndividualStrokeWeights(tx: Transaction, node: SceneNode, weights: IndividualStrokeWeights | undefined): void {
  if (node.type !== 'FRAME' && node.type !== 'RECTANGLE') return;
  if (!weights) {
    tx.set(node.id, 'individualStrokeWeights', undefined);
    return;
  }
  const clean = (v: number) => Math.max(0, Math.round(v * 100) / 100);
  const w = { top: clean(weights.top), right: clean(weights.right), bottom: clean(weights.bottom), left: clean(weights.left) };
  if (w.top === w.right && w.right === w.bottom && w.bottom === w.left) {
    tx.set(node.id, 'strokeWeight', w.top);
    tx.set(node.id, 'individualStrokeWeights', undefined);
    return;
  }
  tx.set(node.id, 'individualStrokeWeights', w);
}

export const paintsEqual = (a: readonly Paint[], b: readonly Paint[]): boolean => JSON.stringify(a) === JSON.stringify(b);
