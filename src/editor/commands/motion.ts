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

import { DEFAULT_ANIMATION, keyframeAt, removeKeyframe, setKeyframe, trackFor } from '@/core/motion/animation';
import type { Id } from '@/core/ids/ids';
import { isSceneNode, type AnimatedProperty, type PageAnimation, type PageNode, type SceneNode } from '@/core/schema/document';
import { rotationDegrees } from './properties';
import type { Editor } from '../editor';

/** The animation of the page being edited, if it has one. */
export function pageAnimation(editor: Editor, pageId: Id = editor.pageId): PageAnimation | undefined {
  const page = editor.doc.get(pageId);
  return page?.type === 'PAGE' ? page.animation : undefined;
}

/** What a layer's animated property is in the file itself, which is what a new keyframe records. */
export function baseValue(node: SceneNode, property: AnimatedProperty): number {
  switch (property) {
    case 'x':
      return node.transform[4];
    case 'y':
      return node.transform[5];
    case 'width':
      return node.size.width;
    case 'height':
      return node.size.height;
    case 'rotation':
      return rotationDegrees(node);
    case 'opacity':
      return node.opacity;
  }
}

/** Writes the page's animation, as one undo step. */
function writeAnimation(editor: Editor, label: string, next: (animation: PageAnimation) => PageAnimation): boolean {
  const pageId = editor.pageId;
  const page = editor.doc.get(pageId);
  if (page?.type !== 'PAGE') return false;
  const animation = next(page.animation ?? DEFAULT_ANIMATION);
  editor.history.run(label, (tx) => tx.set(pageId, 'animation', animation.tracks.length === 0 && animation.duration === DEFAULT_ANIMATION.duration && animation.playback === DEFAULT_ANIMATION.playback ? undefined : animation));
  return true;
}

/** Whether a layer's property has a keyframe exactly at a moment. */
export function hasKeyframe(editor: Editor, nodeId: Id, property: AnimatedProperty, time: number): boolean {
  return keyframeAt(trackFor(pageAnimation(editor), nodeId, property), Math.round(time)) !== undefined;
}

/** Whether a layer's property is animated at all. */
export function isAnimated(editor: Editor, nodeId: Id, property: AnimatedProperty): boolean {
  return trackFor(pageAnimation(editor), nodeId, property) !== undefined;
}

/**
 * Add keyframe: records what the layers' property is now, at the playhead. With a value, that value is recorded
 * instead — which is how changing a field while the playhead is somewhere else makes the next keyframe.
 */
export function addKeyframe(editor: Editor, ids: readonly Id[], property: AnimatedProperty, time: number, value?: number): boolean {
  const layers = ids.map((id) => editor.doc.get(id)).filter((node): node is SceneNode => node !== undefined && isSceneNode(node));
  if (layers.length === 0) return false;
  return writeAnimation(editor, 'Add keyframe', (animation) =>
    layers.reduce((next, node) => setKeyframe(next, node.id, property, time, value ?? baseValue(node, property)), animation),
  );
}

/** Removes the keyframe of the layers' property at the playhead. */
export function deleteKeyframe(editor: Editor, ids: readonly Id[], property: AnimatedProperty, time: number): boolean {
  if (ids.length === 0) return false;
  return writeAnimation(editor, 'Delete keyframe', (animation) => ids.reduce((next, id) => removeKeyframe(next, id, property, time), animation));
}

/** How long the animation runs, in milliseconds. */
export function setAnimationDuration(editor: Editor, duration: number): boolean {
  const ms = Math.round(Math.min(600_000, Math.max(1, duration)));
  return writeAnimation(editor, 'Change duration', (animation) => ({ ...animation, duration: ms }));
}

/** How the animation plays: over and over, once, or forward and back. */
export function setAnimationPlayback(editor: Editor, playback: PageAnimation['playback']): boolean {
  return writeAnimation(editor, 'Change playback', (animation) => ({ ...animation, playback }));
}

/** The page's animation as it is, or a fresh one, for the timeline to show. */
export const animationOf = (page: PageNode | undefined): PageAnimation => page?.animation ?? DEFAULT_ANIMATION;
