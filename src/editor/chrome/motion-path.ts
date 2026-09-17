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
import { trackFor, valueAt } from '@/core/motion/animation';
import { matrixOf } from '@/core/scene/scene-index';
import { isSceneNode, type AnimationTrack, type SceneNode } from '@/core/schema/document';
import { pageAnimation } from '../commands/motion';
import { anchorPoint } from '../commands/properties';
import type { Editor } from '../editor';
import { worldToScreen } from '../viewport/viewport';

/** How big the box marking a keyframe is on screen, in CSS pixels. */
export const MOTION_PATH_KEYFRAME_SIZE = 8;

/** How many dots stand between two keyframes; their spacing is the easing of that stretch made visible. */
const DOTS_PER_SEGMENT = 12;

/** A moment on the motion path, and where the layer is then. */
export interface MotionPathPoint {
  readonly time: number;
  readonly screen: Vec2;
}

/** The path a layer travels: a box at every position keyframe, and dots along the stretches between them. */
export interface MotionPath {
  readonly nodeId: Id;
  readonly points: readonly MotionPathPoint[];
  readonly dots: readonly Vec2[];
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
  const at = (time: number) => worldToScreen(viewport, apply(world, parentPointAt(node, x, y, time)));

  const dots: Vec2[] = [];
  for (let i = 0; i + 1 < times.length; i += 1) {
    const from = times[i]!;
    const span = times[i + 1]! - from;
    // The dots are evenly spaced in time, so easing bunches them up where the layer moves slowly.
    for (let step = 1; step < DOTS_PER_SEGMENT; step += 1) dots.push(at(from + (span * step) / DOTS_PER_SEGMENT));
  }
  return { nodeId: node.id, points: times.map((time) => ({ time, screen: at(time) })), dots };
}

/** Where the layer's anchor point stands in its parent at a moment, which is the point the path traces. */
function parentPointAt(node: SceneNode, x: AnimationTrack | undefined, y: AnimationTrack | undefined, time: number): Vec2 {
  const linear = matrixOf(node.transform);
  const offset = applyLinear(linear, anchorPoint(node));
  return {
    x: (x ? valueAt(x, time) : node.transform[4]) + offset.x,
    y: (y ? valueAt(y, time) : node.transform[5]) + offset.y,
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
