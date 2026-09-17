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

import type { Id } from '../ids/ids';
import { evaluateEasing } from '../anim/easing';
import { toEasing } from '../prototype/reactions';
import type { AnimatedProperty, AnimationTrack, Keyframe, KeyframeEasing, PageAnimation } from '../schema/document';

/** A new animation: two seconds, played over and over, with nothing animated yet. */
export const DEFAULT_ANIMATION: PageAnimation = { duration: 2000, playback: 'LOOP', tracks: [] };

/** The properties a layer can be animated on, in the order the properties panel shows them. */
export const ANIMATED_PROPERTIES: readonly AnimatedProperty[] = ['x', 'y', 'width', 'height', 'rotation', 'opacity'];

export const ANIMATED_PROPERTY_LABELS: Readonly<Record<AnimatedProperty, string>> = {
  x: 'X position',
  y: 'Y position',
  width: 'Width',
  height: 'Height',
  rotation: 'Rotation',
  opacity: 'Opacity',
};

/** The track of a layer's property, if it has one. */
export function trackFor(animation: PageAnimation | undefined, nodeId: Id, property: AnimatedProperty): AnimationTrack | undefined {
  return animation?.tracks.find((track) => track.nodeId === nodeId && track.property === property);
}

/** The keyframe at a moment, if the track has one exactly there. */
export function keyframeAt(track: AnimationTrack | undefined, time: number): Keyframe | undefined {
  return track?.keyframes.find((keyframe) => keyframe.time === time);
}

/**
 * What a track's property is at a moment: the keyframe there, the value blended between the keyframes either side, or
 * the nearest keyframe's value beyond the ends (an animation holds its first and last values).
 */
export function valueAt(track: AnimationTrack, time: number): number {
  const keyframes = track.keyframes;
  const first = keyframes[0]!;
  if (time <= first.time) return first.value;
  const last = keyframes[keyframes.length - 1]!;
  if (time >= last.time) return last.value;
  for (let i = 1; i < keyframes.length; i++) {
    const to = keyframes[i]!;
    if (to.time < time) continue;
    const from = keyframes[i - 1]!;
    const span = to.time - from.time;
    const t = span > 0 ? (time - from.time) / span : 1;
    return from.value + (to.value - from.value) * ease(from.easing, t);
  }
  return last.value;
}

/** Every animated property of every layer at a moment: layer id → property → value. */
export function valuesAt(animation: PageAnimation | undefined, time: number): Map<Id, Partial<Record<AnimatedProperty, number>>> {
  const out = new Map<Id, Partial<Record<AnimatedProperty, number>>>();
  for (const track of animation?.tracks ?? []) {
    if (track.keyframes.length === 0) continue;
    const values = out.get(track.nodeId) ?? {};
    values[track.property] = valueAt(track, time);
    out.set(track.nodeId, values);
  }
  return out;
}

/** How far along the move is at `t`, given the easing that starts the segment; without one it runs straight. */
export function ease(easing: KeyframeEasing | undefined, t: number): number {
  if (!easing) return t;
  return evaluateEasing(easing.type === 'HOLD' ? { type: 'hold' } : toEasing(easing), t);
}

/** An animation with the easing set on the segment that starts at a keyframe (undefined runs it straight). */
export function setKeyframeEasing(animation: PageAnimation, nodeId: Id, property: AnimatedProperty, time: number, easing: KeyframeEasing | undefined): PageAnimation {
  const track = trackFor(animation, nodeId, property);
  if (!track || !keyframeAt(track, Math.round(time))) return animation;
  const keyframes = track.keyframes.map((keyframe) => {
    if (keyframe.time !== Math.round(time)) return keyframe;
    const { easing: _previous, ...rest } = keyframe;
    return easing ? { ...rest, easing } : rest;
  });
  return { ...animation, tracks: animation.tracks.map((t) => (t === track ? { ...t, keyframes } : t)) };
}

/** Keyframes in time order, with only one at any moment. */
const ordered = (keyframes: readonly Keyframe[]): Keyframe[] => [...keyframes].sort((a, b) => a.time - b.time);

/** An animation with a keyframe set on a layer's property at a moment, replacing the one already there. */
export function setKeyframe(animation: PageAnimation, nodeId: Id, property: AnimatedProperty, time: number, value: number): PageAnimation {
  const at = Math.max(0, Math.round(time));
  const existing = trackFor(animation, nodeId, property);
  if (!existing) return { ...animation, tracks: [...animation.tracks, { nodeId, property, keyframes: [{ time: at, value }] }] };
  const keyframes = ordered([...existing.keyframes.filter((keyframe) => keyframe.time !== at), { time: at, value }]);
  return { ...animation, tracks: animation.tracks.map((track) => (track === existing ? { ...track, keyframes } : track)) };
}

/** An animation without the keyframe at a moment; a track left with none goes away. */
export function removeKeyframe(animation: PageAnimation, nodeId: Id, property: AnimatedProperty, time: number): PageAnimation {
  const existing = trackFor(animation, nodeId, property);
  if (!existing) return animation;
  const keyframes = existing.keyframes.filter((keyframe) => keyframe.time !== Math.round(time));
  if (keyframes.length === 0) return { ...animation, tracks: animation.tracks.filter((track) => track !== existing) };
  return { ...animation, tracks: animation.tracks.map((track) => (track === existing ? { ...track, keyframes } : track)) };
}

/** An animation with a keyframe moved to another moment, keeping its value; a keyframe already there gives way. */
export function moveKeyframe(animation: PageAnimation, nodeId: Id, property: AnimatedProperty, from: number, to: number): PageAnimation {
  const track = trackFor(animation, nodeId, property);
  const keyframe = keyframeAt(track, Math.round(from));
  if (!track || !keyframe) return animation;
  const at = Math.max(0, Math.round(to));
  const keyframes = ordered([...track.keyframes.filter((k) => k.time !== keyframe.time && k.time !== at), { time: at, value: keyframe.value }]);
  return { ...animation, tracks: animation.tracks.map((t) => (t === track ? { ...t, keyframes } : t)) };
}

/** An animation without any track of the layers given (used when they are deleted). */
export function withoutLayers(animation: PageAnimation, ids: ReadonlySet<Id>): PageAnimation {
  return { ...animation, tracks: animation.tracks.filter((track) => !ids.has(track.nodeId)) };
}

/** The layers the animation touches, in the order their tracks were added. */
export function animatedLayers(animation: PageAnimation | undefined): Id[] {
  const seen: Id[] = [];
  for (const track of animation?.tracks ?? []) if (!seen.includes(track.nodeId)) seen.push(track.nodeId);
  return seen;
}

/** Where the playhead sits after `elapsed` milliseconds of playing, and whether the animation has finished. */
export function playheadAt(animation: PageAnimation, elapsed: number): { readonly time: number; readonly done: boolean } {
  const duration = Math.max(1, animation.duration);
  if (animation.playback === 'ONCE') return { time: Math.min(duration, elapsed), done: elapsed >= duration };
  if (animation.playback === 'LOOP') return { time: elapsed % duration, done: false };
  // Ping-pong: forward, then back, over and over.
  const cycle = elapsed % (duration * 2);
  return { time: cycle <= duration ? cycle : duration * 2 - cycle, done: false };
}
