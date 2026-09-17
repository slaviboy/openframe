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
import type { AnimatedProperty, AnimationTrack, Keyframe, KeyframeEasing, MotionCurve, PageAnimation } from '../schema/document';

/** A new animation: two seconds, played over and over, with nothing animated yet. */
export const DEFAULT_ANIMATION: PageAnimation = { duration: 2000, playback: 'LOOP', tracks: [] };

/** The properties a layer can be animated on, in the order the properties panel shows them. */
export const ANIMATED_PROPERTIES: readonly AnimatedProperty[] = ['x', 'y', 'width', 'height', 'rotation', 'opacity', 'trimStart', 'trimEnd'];

export const ANIMATED_PROPERTY_LABELS: Readonly<Record<AnimatedProperty, string>> = {
  x: 'X position',
  y: 'Y position',
  width: 'Width',
  height: 'Height',
  rotation: 'Rotation',
  opacity: 'Opacity',
  trimStart: 'Path trim start',
  trimEnd: 'Path trim end',
};

/** A keyframe on the timeline: which layer's property it belongs to, and when it is. */
export interface KeyframeRef {
  readonly nodeId: Id;
  readonly property: AnimatedProperty;
  readonly time: number;
}

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
  // A bent motion path moves the layer off the straight line between its position keyframes.
  if (animation?.curves?.length) {
    for (const [nodeId, values] of out) {
      if (values.x === undefined || values.y === undefined) continue;
      const offset = curveOffsetAt(animation, nodeId, time);
      values.x += offset.x;
      values.y += offset.y;
    }
  }
  return out;
}

/**
 * How far along the move is at `t`, given the easing that starts the segment; without one it runs straight. An easing
 * still standing as a variable runs straight too: it is looked up before the animation is evaluated.
 */
export function ease(easing: KeyframeEasing | undefined, t: number): number {
  if (!easing || easing.type === 'VARIABLE_ALIAS') return t;
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
  const tracks = keyframes.length === 0 ? animation.tracks.filter((track) => track !== existing) : animation.tracks.map((track) => (track === existing ? { ...track, keyframes } : track));
  return prunedCurves({ ...animation, tracks }, nodeId);
}

/** An animation with a keyframe moved to another moment, keeping its value; a keyframe already there gives way. */
export function moveKeyframe(animation: PageAnimation, nodeId: Id, property: AnimatedProperty, from: number, to: number): PageAnimation {
  const track = trackFor(animation, nodeId, property);
  const keyframe = keyframeAt(track, Math.round(from));
  if (!track || !keyframe) return animation;
  const at = Math.max(0, Math.round(to));
  const keyframes = ordered([...track.keyframes.filter((k) => k.time !== keyframe.time && k.time !== at), { time: at, value: keyframe.value }]);
  const moved = { ...animation, tracks: animation.tracks.map((t) => (t === track ? { ...t, keyframes } : t)) };
  // A bend belongs to the stretch that starts at the keyframe, so it travels with it.
  const bend = curveFor(animation, nodeId, keyframe.time);
  return prunedCurves(bend ? setCurve(setCurve(moved, nodeId, keyframe.time, undefined), nodeId, at, bend) : moved, nodeId);
}

/** Keyframes with only one at any moment, the last one written winning. */
const deduped = (keyframes: readonly Keyframe[]): Keyframe[] => {
  const byTime = new Map<number, Keyframe>();
  for (const keyframe of keyframes) byTime.set(keyframe.time, keyframe);
  return [...byTime.values()];
};

/** The stretch of the animation a layer's keyframes cover, if it has any. */
export function layerExtent(animation: PageAnimation | undefined, nodeId: Id): { readonly from: number; readonly to: number } | undefined {
  const times = (animation?.tracks ?? []).filter((track) => track.nodeId === nodeId).flatMap((track) => track.keyframes.map((keyframe) => keyframe.time));
  return times.length === 0 ? undefined : { from: Math.min(...times), to: Math.max(...times) };
}

/** A layer's keyframes, and the bends between them, put at new moments: how a whole track is moved or stretched. */
export function retimeLayer(animation: PageAnimation, nodeId: Id, at: (time: number) => number): PageAnimation {
  const moment = (time: number) => Math.max(0, Math.min(600_000, Math.round(at(time))));
  const tracks = animation.tracks.map((track) => (track.nodeId === nodeId ? { ...track, keyframes: ordered(deduped(track.keyframes.map((k) => ({ ...k, time: moment(k.time) })))) } : track));
  const curves = animation.curves?.map((curve) => (curve.nodeId === nodeId ? { ...curve, time: moment(curve.time) } : curve));
  return withCurves({ ...animation, tracks }, curves);
}

/** An animation without any track of the layers given (used when they are deleted). */
export function withoutLayers(animation: PageAnimation, ids: ReadonlySet<Id>): PageAnimation {
  const tracks = animation.tracks.filter((track) => !ids.has(track.nodeId));
  const curves = animation.curves?.filter((curve) => !ids.has(curve.nodeId));
  return withCurves({ ...animation, tracks }, curves);
}

/** An animation carrying the curves given, the field dropped once every path runs straight again. */
function withCurves(animation: PageAnimation, curves: readonly MotionCurve[] | undefined): PageAnimation {
  const { curves: _previous, ...rest } = animation;
  return curves && curves.length > 0 ? { ...rest, curves: [...curves] } : rest;
}

/** The moments a layer's position is keyframed at: the stretches of its motion path run between them. */
export function pathTimes(animation: PageAnimation | undefined, nodeId: Id): number[] {
  const x = trackFor(animation, nodeId, 'x');
  const y = trackFor(animation, nodeId, 'y');
  return [...new Set([...(x?.keyframes ?? []), ...(y?.keyframes ?? [])].map((keyframe) => keyframe.time))].sort((a, b) => a - b);
}

/** The stretch of a layer's motion path a moment falls in, given by the keyframed moments either side of it. */
export function pathSegmentAt(animation: PageAnimation | undefined, nodeId: Id, time: number): { readonly from: number; readonly to: number } | undefined {
  const times = pathTimes(animation, nodeId);
  for (let i = 0; i + 1 < times.length; i += 1) if (time >= times[i]! && time <= times[i + 1]!) return { from: times[i]!, to: times[i + 1]! };
  return undefined;
}

/** The bend set on the stretch that starts at a moment, if it has one. */
export function curveFor(animation: PageAnimation | undefined, nodeId: Id, time: number): MotionCurve | undefined {
  return animation?.curves?.find((curve) => curve.nodeId === nodeId && curve.time === Math.round(time));
}

/** An animation with the stretch starting at a moment bent off its straight line; no offset makes it straight again. */
export function setCurve(animation: PageAnimation, nodeId: Id, time: number, offset: { readonly x: number; readonly y: number } | undefined): PageAnimation {
  const at = Math.max(0, Math.round(time));
  const others = (animation.curves ?? []).filter((curve) => !(curve.nodeId === nodeId && curve.time === at));
  return withCurves(animation, offset ? [...others, { nodeId, time: at, x: offset.x, y: offset.y }] : others);
}

/** Drops the bends of a layer that no longer start at one of its position keyframes. */
function prunedCurves(animation: PageAnimation, nodeId: Id): PageAnimation {
  if (!animation.curves) return animation;
  const times = new Set(pathTimes(animation, nodeId));
  // A bend needs a stretch to bend: the last keyframed moment starts none.
  const last = Math.max(...times, -1);
  return withCurves(animation, animation.curves.filter((curve) => curve.nodeId !== nodeId || (times.has(curve.time) && curve.time !== last)));
}

/**
 * How far a bend pulls a layer off its straight path at a moment. A bent stretch is a quadratic bezier, which works
 * out to the straight run plus a bump peaking in its middle — so the bend is added to the eased values rather than
 * replacing them, and the easing goes on shaping how fast the layer travels the curve.
 */
export function curveOffsetAt(animation: PageAnimation | undefined, nodeId: Id, time: number): { x: number; y: number } {
  const none = { x: 0, y: 0 };
  if (!animation?.curves?.length) return none;
  const segment = pathSegmentAt(animation, nodeId, time);
  const curve = segment ? curveFor(animation, nodeId, segment.from) : undefined;
  if (!segment || !curve) return none;

  const x = trackFor(animation, nodeId, 'x');
  const y = trackFor(animation, nodeId, 'y');
  const at = (track: AnimationTrack | undefined, moment: number) => (track ? valueAt(track, moment) : 0);
  const dx = at(x, segment.to) - at(x, segment.from);
  const dy = at(y, segment.to) - at(y, segment.from);
  // How far along the stretch the layer already is, taken from the value itself so easing slides it along one fixed
  // curve rather than reshaping the curve. A layer that does not move over the stretch falls back to the clock.
  const u =
    Math.abs(dx) >= Math.abs(dy) && dx !== 0
      ? (at(x, time) - at(x, segment.from)) / dx
      : dy !== 0
        ? (at(y, time) - at(y, segment.from)) / dy
        : (time - segment.from) / Math.max(1, segment.to - segment.from);
  const bump = 2 * u * (1 - u);
  return { x: curve.x * bump, y: curve.y * bump };
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
