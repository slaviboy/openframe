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
import { apply, applyLinear, invert, IDENTITY, type Matrix } from '@/core/math/matrix';
import type { Vec2 } from '@/core/math/vec';
import { curveFor, curveOffsetAt, pathSegmentAt, trackFor, valueAt } from '@/core/motion/animation';
import { matrixOf } from '@/core/scene/scene-index';
import { isSceneNode, type AnimationTrack, type PageAnimation, type SceneNode } from '@/core/schema/document';
import { pageAnimation } from '../commands/motion';
import { anchorPoint } from '../commands/properties';
import type { Editor } from '../editor';
import { worldToScreen } from '../viewport/viewport';

/** How big the box marking a keyframe is on screen, in CSS pixels. */
export const MOTION_PATH_KEYFRAME_SIZE = 8;

/** How big the round handle that bends a stretch is on screen, in CSS pixels. */
export const MOTION_PATH_CURVE_SIZE = 7;

/** How many dots stand between two keyframes; their spacing is the easing of that stretch made visible. */
const DOTS_PER_SEGMENT = 12;

/** A moment on the motion path, and where the layer is then. */
export interface MotionPathPoint {
  readonly time: number;
  readonly screen: Vec2;
}

/**
 * The path a layer travels: a box at every position keyframe, dots along the stretches between them, and a round
 * handle in the middle of each stretch that bends it.
 */
export interface MotionPath {
  readonly nodeId: Id;
  readonly points: readonly MotionPathPoint[];
  readonly dots: readonly Vec2[];
  readonly curves: readonly MotionPathPoint[];
}

/** The layer whose motion path is shown: a single selection in Motion with position keyframes on it. */
function pathTarget(editor: Editor): SceneNode | null {
  const state = editor.state.getSnapshot();
  if (state.mode !== 'motion') return null;
  const [id, ...rest] = state.selection;
  if (id === undefined || rest.length > 0) return null;
  const node = editor.doc.get(id);
  return node && isSceneNode(node) && node.type !== 'SECTION' ? node : null;
}

/** Where a layer's parent sits in the world, which its x and y are measured in. */
function parentWorld(editor: Editor, node: SceneNode): Matrix {
  const parentId = editor.doc.parentOf(node.id);
  const parent = parentId === null ? undefined : editor.doc.get(parentId);
  return parent && isSceneNode(parent) ? editor.scene.computeWorld(parent.id) : IDENTITY;
}

/** The layer's motion path, or null when it has no position keyframes to show one. */
export function motionPath(editor: Editor): MotionPath | null {
  const node = pathTarget(editor);
  if (!node) return null;
  const animation = pageAnimation(editor);
  const x = trackFor(animation, node.id, 'x');
  const y = trackFor(animation, node.id, 'y');
  if (!x && !y) return null;

  const times = [...new Set([...(x?.keyframes ?? []), ...(y?.keyframes ?? [])].map((k) => k.time))].sort((a, b) => a - b);
  const viewport = editor.state.viewport;
  const world = parentWorld(editor, node);
  const at = (time: number) => worldToScreen(viewport, apply(world, parentPointAt(node, x, y, time, animation)));

  const dots: Vec2[] = [];
  const curves: MotionPathPoint[] = [];
  for (let i = 0; i + 1 < times.length; i += 1) {
    const from = times[i]!;
    const span = times[i + 1]! - from;
    // The dots are evenly spaced in time, so easing bunches them up where the layer moves slowly.
    for (let step = 1; step < DOTS_PER_SEGMENT; step += 1) dots.push(at(from + (span * step) / DOTS_PER_SEGMENT));
    curves.push({ time: from, screen: worldToScreen(viewport, apply(world, curveHandleParentPoint(node, animation, from, times[i + 1]!))) });
  }
  return { nodeId: node.id, points: times.map((time) => ({ time, screen: at(time) })), dots, curves };
}

/** Where a stretch's bend handle sits in the layer's parent: the middle of the curve it draws. */
function curveHandleParentPoint(node: SceneNode, animation: PageAnimation | undefined, from: number, to: number): Vec2 {
  const x = trackFor(animation, node.id, 'x');
  const y = trackFor(animation, node.id, 'y');
  const start = parentPointAt(node, x, y, from, undefined);
  const end = parentPointAt(node, x, y, to, undefined);
  const bend = curveFor(animation, node.id, from);
  // The bend pulls the middle of the stretch half as far as the offset, which is where the handle is taken hold of.
  return { x: (start.x + end.x) / 2 + (bend?.x ?? 0) / 2, y: (start.y + end.y) / 2 + (bend?.y ?? 0) / 2 };
}

/**
 * Where the layer's anchor point stands in its parent at a moment, which is the point the path traces. With the
 * animation given, any bend in the path is followed; without it the straight line between the keyframes is.
 */
function parentPointAt(node: SceneNode, x: AnimationTrack | undefined, y: AnimationTrack | undefined, time: number, animation: PageAnimation | undefined): Vec2 {
  const linear = matrixOf(node.transform);
  const offset = applyLinear(linear, anchorPoint(node));
  const bend = animation ? curveOffsetAt(animation, node.id, time) : { x: 0, y: 0 };
  return {
    x: (x ? valueAt(x, time) : node.transform[4]) + offset.x + bend.x,
    y: (y ? valueAt(y, time) : node.transform[5]) + offset.y + bend.y,
  };
}

/** The keyframe box under a screen point, if there is one. */
export function hitMotionPathKeyframe(editor: Editor, screen: Vec2): { readonly nodeId: Id; readonly time: number; readonly center: Vec2 } | null {
  const path = motionPath(editor);
  if (!path) return null;
  const reach = MOTION_PATH_KEYFRAME_SIZE / 2 + 3;
  // Later keyframes sit on top, so the last match wins.
  let hit: { nodeId: Id; time: number; center: Vec2 } | null = null;
  for (const point of path.points) {
    if (Math.abs(screen.x - point.screen.x) <= reach && Math.abs(screen.y - point.screen.y) <= reach) hit = { nodeId: path.nodeId, time: point.time, center: point.screen };
  }
  return hit;
}

/** The bend handle under a screen point, if there is one. */
export function hitMotionPathCurve(editor: Editor, screen: Vec2): { readonly nodeId: Id; readonly time: number; readonly center: Vec2 } | null {
  const path = motionPath(editor);
  if (!path) return null;
  const reach = MOTION_PATH_CURVE_SIZE / 2 + 3;
  for (const handle of path.curves) {
    if (Math.hypot(screen.x - handle.screen.x, screen.y - handle.screen.y) <= reach) return { nodeId: path.nodeId, time: handle.time, center: handle.screen };
  }
  return null;
}

/** How far a world point pulls the middle of a stretch off the straight line between its keyframes. */
export function curveOffsetFor(editor: Editor, nodeId: Id, from: number, world: Vec2): Vec2 | null {
  const node = editor.doc.get(nodeId);
  if (!node || !isSceneNode(node)) return null;
  const animation = pageAnimation(editor);
  const segment = pathSegmentAt(animation, nodeId, Math.round(from));
  const toParent = invert(parentWorld(editor, node));
  if (!segment || !toParent) return null;
  const x = trackFor(animation, nodeId, 'x');
  const y = trackFor(animation, nodeId, 'y');
  const start = parentPointAt(node, x, y, segment.from, undefined);
  const end = parentPointAt(node, x, y, segment.to, undefined);
  const point = apply(toParent, world);
  // The middle of the curve moves half as far as the offset, so the pull needed is twice what the handle moved.
  const round = (value: number) => Math.round(value * 100) / 100;
  return { x: round(2 * (point.x - (start.x + end.x) / 2)), y: round(2 * (point.y - (start.y + end.y) / 2)) };
}

/** The x and y a keyframe needs for the layer's anchor point to land on a world point. */
export function keyframePositionAt(editor: Editor, nodeId: Id, world: Vec2): Vec2 | null {
  const node = editor.doc.get(nodeId);
  if (!node || !isSceneNode(node)) return null;
  const toParent = invert(parentWorld(editor, node));
  if (!toParent) return null;
  const point = apply(toParent, world);
  const offset = applyLinear(matrixOf(node.transform), anchorPoint(node));
  return { x: Math.round((point.x - offset.x) * 100) / 100, y: Math.round((point.y - offset.y) * 100) / 100 };
}
