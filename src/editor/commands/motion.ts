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

import type { KeyframeRef } from '@/core/motion/animation';
import {
  DEFAULT_ANIMATION,
  keyframeAt,
  layerExtent,
  retimeLayer,
  moveKeyframe,
  pathSegmentAt,
  removeKeyframe,
  setCurve,
  setKeyframe,
  setKeyframeEasing,
  trackFor,
  valueAt,
} from '@/core/motion/animation';
import { animatedInstances, instanceOffset, instanceTracks, withInstances } from '@/core/motion/instances';
import { presetById, PRESET_DURATION, type PresetBase } from '@/core/motion/presets';
import type { Id } from '@/core/ids/ids';
import { isSceneNode, type AnimatedProperty, type KeyframeEasing, type PageAnimation, type PageNode, type PrototypeEasing, type SceneNode, type VariableNode } from '@/core/schema/document';
import { rotationDegrees } from './properties';
import { collectionVariables, localCollections, resolveForLayer, variableLookup } from '@/core/variables/document';
import { isVariableEasing } from '@/core/variables/resolve';
import { createVariable, setVariableValue } from './variables';
import type { Editor } from '../editor';

/** The animation of the page being edited, if it has one. */
export function pageAnimation(editor: Editor, pageId: Id = editor.pageId): PageAnimation | undefined {
  const page = editor.doc.get(pageId);
  return page?.type === 'PAGE' ? page.animation : undefined;
}

/**
 * The page's animation with any easing that stands as a variable looked up, which is what is evaluated. Editing works
 * on the stored animation, so the variable stays bound; only the reading of it needs the value behind the name.
 */
export function resolvedAnimation(editor: Editor, pageId: Id = editor.pageId): PageAnimation | undefined {
  const animation = pageAnimation(editor, pageId);
  const boundEasing = animation?.tracks.some((track) => track.keyframes.some((keyframe) => keyframe.easing?.type === 'VARIABLE_ALIAS'));
  if (!animation || (!boundEasing && !animation.durationVariable)) return animation;
  const lookup = variableLookup(editor.doc);

  // A timing variable carries the animation's length in milliseconds; one that is gone leaves the stored length.
  let duration = animation.duration;
  if (animation.durationVariable) {
    const value = resolveForLayer(editor.doc, lookup, pageId, animation.durationVariable.id);
    if (typeof value === 'number' && Number.isFinite(value) && value >= 1) duration = Math.round(value);
  }
  if (!boundEasing) return { ...animation, duration };

  const tracks = animation.tracks.map((track) => ({
    ...track,
    keyframes: track.keyframes.map((keyframe) => {
      if (keyframe.easing?.type !== 'VARIABLE_ALIAS') return keyframe;
      const value = resolveForLayer(editor.doc, lookup, track.nodeId, keyframe.easing.id);
      // A variable that is gone, or holds something else, leaves the stretch running straight.
      const { easing: _bound, ...rest } = keyframe;
      return isVariableEasing(value) ? { ...rest, easing: value } : rest;
    }),
  }));
  return { ...animation, duration, tracks };
}

/**
 * The animation as the canvas shows it: easing variables looked up, and every animated instance running its main
 * component's tracks on its own layers. Editing works on the stored animation, which holds neither.
 */
export function shownAnimation(editor: Editor, pageId: Id = editor.pageId): PageAnimation | undefined {
  return withInstances(editor.doc, resolvedAnimation(editor, pageId), pageId);
}

/** How far along the timeline an instance has been dragged, as one undo step. */
export function setInstanceOffset(editor: Editor, instanceId: Id, offset: number): boolean {
  const node = editor.doc.get(instanceId);
  if (node?.type !== 'FRAME' || !node.instance) return false;
  const at = Math.max(0, Math.min(600_000, Math.round(offset)));
  if ((node.animationOffset ?? 0) === at) return false;
  editor.history.run('Move instance', (tx) => tx.set(instanceId, 'animationOffset', at === 0 ? undefined : at), { mergeKey: `instance-offset:${instanceId}` });
  return true;
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
    // Path trim is a share of the path, kept off the layer entirely while the whole of it is drawn.
    case 'trimStart':
      return 'strokeTrimStart' in node ? (node.strokeTrimStart ?? 0) : 0;
    case 'trimEnd':
      return 'strokeTrimEnd' in node ? (node.strokeTrimEnd ?? 1) : 1;
  }
}

/** Writes the page's animation, as one undo step. */
function writeAnimation(editor: Editor, label: string, next: (animation: PageAnimation) => PageAnimation, mergeKey?: string): boolean {
  const pageId = editor.pageId;
  const page = editor.doc.get(pageId);
  if (page?.type !== 'PAGE') return false;
  const animation = next(page.animation ?? DEFAULT_ANIMATION);
  const plain = animation.tracks.length === 0 && animation.duration === DEFAULT_ANIMATION.duration && animation.playback === DEFAULT_ANIMATION.playback;
  editor.history.run(label, (tx) => tx.set(pageId, 'animation', plain ? undefined : animation), mergeKey === undefined ? {} : { mergeKey });
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
  // Scrubbing a field writes the same keyframe over and over: they merge into one step.
  return writeAnimation(
    editor,
    'Add keyframe',
    (animation) => layers.reduce((next, node) => setKeyframe(next, node.id, property, time, value ?? baseValue(node, property)), animation),
    `keyframe:${property}:${Math.round(time)}:${ids.join(',')}`,
  );
}

/** Removes the keyframe of the layers' property at the playhead. */
export function deleteKeyframe(editor: Editor, ids: readonly Id[], property: AnimatedProperty, time: number): boolean {
  if (ids.length === 0) return false;
  return writeAnimation(editor, 'Delete keyframe', (animation) => ids.reduce((next, id) => removeKeyframe(next, id, property, time), animation));
}

export type { KeyframeRef } from '@/core/motion/animation';
export { animatedInstances, instanceOffset, instanceTracks };

/** Moves keyframes by `delta` milliseconds, as one undo step; they stop at the animation's start. */
export function moveKeyframes(editor: Editor, refs: readonly KeyframeRef[], delta: number): boolean {
  if (refs.length === 0 || Math.round(delta) === 0) return false;
  return writeAnimation(editor, 'Move keyframe', (animation) => refs.reduce((next, ref) => moveKeyframe(next, ref.nodeId, ref.property, ref.time, Math.max(0, ref.time + delta)), animation));
}

/**
 * Moves a position keyframe on the canvas: the layer's x and y at that moment both become the point given, so dragging
 * a box on the motion path reshapes the path. A layer animated in only one of the two gains the other's keyframe here.
 */
export function moveKeyframePosition(editor: Editor, nodeId: Id, time: number, point: { readonly x: number; readonly y: number }): boolean {
  const node = editor.doc.get(nodeId);
  if (!node || !isSceneNode(node)) return false;
  const at = Math.round(time);
  // A whole drag is one undo step.
  return writeAnimation(editor, 'Move keyframe', (animation) => setKeyframe(setKeyframe(animation, nodeId, 'x', at, point.x), nodeId, 'y', at, point.y), `motion-path:${nodeId}:${at}`);
}

/**
 * Bends the stretch of a layer's motion path that starts at a moment: the offset says how far the middle of it is
 * pulled off the straight line, and no offset makes it straight again. Both ends gain x and y keyframes if they are
 * missing, since a path needs both to bend away from a straight line.
 */
export function curveMotionPath(editor: Editor, nodeId: Id, from: number, offset: { readonly x: number; readonly y: number } | undefined): boolean {
  const node = editor.doc.get(nodeId);
  const at = Math.round(from);
  const segment = pathSegmentAt(pageAnimation(editor), nodeId, at);
  // Only a stretch that starts at the moment given can bend: the last keyframe starts none.
  if (!node || !isSceneNode(node) || segment?.from !== at) return false;
  const bend = offset && (Math.abs(offset.x) >= 1 || Math.abs(offset.y) >= 1) ? offset : undefined;
  return writeAnimation(
    editor,
    'Curve motion path',
    (animation) => {
      let next = animation;
      for (const time of [segment.from, segment.to]) {
        for (const property of ['x', 'y'] as const) {
          const track = trackFor(next, nodeId, property);
          if (!track) next = setKeyframe(next, nodeId, property, time, baseValue(node, property));
          else if (!keyframeAt(track, time)) next = setKeyframe(next, nodeId, property, time, valueAt(track, time));
        }
      }
      return setCurve(next, nodeId, segment.from, bend);
    },
    `curve:${nodeId}:${segment.from}`,
  );
}

/**
 * Puts a layer's whole animation between two moments, moving and stretching every keyframe (and the bends between
 * them) to fit. Dragging a track along the timeline or pulling either of its ends both come through here, and because
 * it says where the track is to end up rather than how far to shift it, a drag can call it over and over.
 */
export function setLayerExtent(editor: Editor, nodeId: Id, from: number, to: number): boolean {
  const extent = layerExtent(pageAnimation(editor), nodeId);
  if (!extent) return false;
  const start = Math.max(0, Math.round(from));
  const end = Math.max(start, Math.round(to));
  const width = extent.to - extent.from;
  if (start === extent.from && end === extent.to) return false;
  const factor = width === 0 ? 1 : (end - start) / width;
  // A whole drag merges into one undo step.
  return writeAnimation(editor, 'Retime track', (animation) => retimeLayer(animation, nodeId, (time) => start + (time - extent.from) * factor), `track:${nodeId}`);
}

/** Removes keyframes, as one undo step. */
export function deleteKeyframes(editor: Editor, refs: readonly KeyframeRef[]): boolean {
  if (refs.length === 0) return false;
  return writeAnimation(editor, 'Delete keyframe', (animation) => refs.reduce((next, ref) => removeKeyframe(next, ref.nodeId, ref.property, ref.time), animation));
}

/** Takes a property's animation off the layers: its track and every keyframe on it. */
export function removeAnimatedProperty(editor: Editor, ids: readonly Id[], property: AnimatedProperty): boolean {
  if (ids.length === 0) return false;
  return writeAnimation(editor, 'Remove animation', (animation) => ({
    ...animation,
    tracks: animation.tracks.filter((track) => !(ids.includes(track.nodeId) && track.property === property)),
  }));
}

/** The easing variables a keyframe can be bound to: every local one of the easing type. */
export function easingVariables(editor: Editor): VariableNode[] {
  return localCollections(editor.doc)
    .flatMap((collection) => collectionVariables(editor.doc, collection.id))
    .filter((variable) => variable.resolvedType === 'EASING');
}

/**
 * Saves a stretch's easing as a variable of its own, in the first collection there is, and binds the keyframes to it.
 * Without a collection there is nowhere to keep it, so nothing is saved.
 */
export function saveEasingAsVariable(editor: Editor, refs: readonly KeyframeRef[], easing: PrototypeEasing, name?: string): Id | null {
  const collection = localCollections(editor.doc)[0];
  if (!collection || refs.length === 0) return null;
  const id = createVariable(editor, collection.id, 'EASING', name);
  if (!id) return null;
  for (const mode of collection.modes) setVariableValue(editor, id, mode.modeId, easing);
  refs.forEach((ref) => setSegmentEasing(editor, ref, { type: 'VARIABLE_ALIAS', id }));
  return id;
}

/** The easing of the stretch that starts at a keyframe; without one the move runs straight. */
export function setSegmentEasing(editor: Editor, ref: KeyframeRef, easing: KeyframeEasing | undefined): boolean {
  return writeAnimation(editor, 'Change easing', (animation) => setKeyframeEasing(animation, ref.nodeId, ref.property, ref.time, easing));
}

/** What a layer is now, which a preset animation works its keyframes out from. */
const presetBase = (node: SceneNode): PresetBase => ({
  x: baseValue(node, 'x'),
  y: baseValue(node, 'y'),
  width: baseValue(node, 'width'),
  height: baseValue(node, 'height'),
  rotation: baseValue(node, 'rotation'),
  opacity: baseValue(node, 'opacity'),
  trimStart: baseValue(node, 'trimStart'),
  trimEnd: baseValue(node, 'trimEnd'),
});

/**
 * Applies a preset animation to the layers, starting at the playhead and running for its own length (a composite style
 * writes several at once). The keyframes it writes are worked out from what each layer is now.
 */
export function applyMotionPreset(editor: Editor, ids: readonly Id[], presetId: string, time: number, duration = PRESET_DURATION): boolean {
  const preset = presetById(presetId);
  const layers = ids.map((id) => editor.doc.get(id)).filter((node): node is SceneNode => node !== undefined && isSceneNode(node));
  if (!preset || layers.length === 0) return false;
  const start = Math.max(0, Math.round(time));
  const end = start + Math.max(1, Math.round(duration));
  return writeAnimation(editor, `Add ${preset.label.toLowerCase()}`, (animation) =>
    layers.reduce(
      (next, node) =>
        preset.steps(presetBase(node)).reduce((withStep, step) => {
          const started = setKeyframe(withStep, node.id, step.property, start, step.from);
          const eased = step.easing ? setKeyframeEasing(started, node.id, step.property, start, step.easing) : started;
          return setKeyframe(eased, node.id, step.property, end, step.to);
        }, next),
      animation,
    ),
  );
}

/** How long the animation runs, in milliseconds. */
export function setAnimationDuration(editor: Editor, duration: number): boolean {
  const ms = Math.round(Math.min(600_000, Math.max(1, duration)));
  return writeAnimation(editor, 'Change duration', (animation) => ({ ...animation, duration: ms }));
}

/**
 * Binds the animation's length to a number variable — a timing variable — so the same length can be shared, or
 * unbinds it, leaving the length the variable last gave it.
 */
export function bindAnimationDuration(editor: Editor, variableId: Id | null): boolean {
  if (variableId === null) {
    const resolved = resolvedAnimation(editor)?.duration;
    return writeAnimation(editor, 'Unbind duration', (animation) => {
      const { durationVariable: _bound, ...rest } = animation;
      return { ...rest, duration: resolved ?? animation.duration };
    });
  }
  const variable = editor.doc.get(variableId);
  if (variable?.type !== 'VARIABLE' || variable.resolvedType !== 'FLOAT') return false;
  return writeAnimation(editor, 'Bind duration', (animation) => ({ ...animation, durationVariable: { type: 'VARIABLE_ALIAS', id: variableId } }));
}

/** How the animation plays: over and over, once, or forward and back. */
export function setAnimationPlayback(editor: Editor, playback: PageAnimation['playback']): boolean {
  return writeAnimation(editor, 'Change playback', (animation) => ({ ...animation, playback }));
}

/** The page's animation as it is, or a fresh one, for the timeline to show. */
export const animationOf = (page: PageNode | undefined): PageAnimation => page?.animation ?? DEFAULT_ANIMATION;
