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

import type { DocumentStore } from '../document/store';
import type { Id } from '../ids/ids';
import type { Rect } from '../math/rect';
import type { Vec2 } from '../math/vec';
import type { SceneIndex } from '../scene/scene-index';
import type { Color, PrototypeTransition, SceneNode, Size } from '../schema/document';
import { overlayOrigin, overlaySettings } from './flows';
import { canSmartAnimate } from './smart-animate';
import type { PlayerEffect, PlayerState } from './player';

/** How presentation view scales the screen to the window. */
export type ScalingMode = 'ACTUAL' | 'FIT_WIDTH' | 'FIT' | 'FILL';

export const SCALING_MODES: readonly ScalingMode[] = ['ACTUAL', 'FIT_WIDTH', 'FIT', 'FILL'];

export const SCALING_LABELS: Readonly<Record<ScalingMode, string>> = {
  ACTUAL: 'Actual size (100%)',
  FIT_WIDTH: 'Fit width',
  FIT: 'Fit width and height',
  FILL: 'Fill screen',
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/**
 * The screen's scale: 1 at actual size; filling the window's width for Fit width; shrinking (never enlarging) to fit
 * both dimensions for Fit width and height; and scaling up or down until it fills the window without overflowing for
 * Fill screen.
 */
export function screenScale(mode: ScalingMode, viewport: Size, frame: Size): number {
  if (frame.width <= 0 || frame.height <= 0 || viewport.width <= 0 || viewport.height <= 0) return 1;
  const fitWidth = viewport.width / frame.width;
  const fitBoth = Math.min(fitWidth, viewport.height / frame.height);
  switch (mode) {
    case 'ACTUAL':
      return 1;
    case 'FIT_WIDTH':
      return fitWidth;
    case 'FILL':
      return fitBoth;
    default:
      return Math.min(1, fitBoth);
  }
}

/** How far a screen taller than the window scrolls, in the screen's coordinates. */
export function maxScrollY(mode: ScalingMode, viewport: Size, frame: Size): number {
  const scale = screenScale(mode, viewport, frame);
  return Math.max(0, frame.height * scale - viewport.height) / scale;
}

/** A frame's offset and opacity at a point of a transition. */
export interface LayerOffset {
  readonly dx: number;
  readonly dy: number;
  readonly alpha: number;
}

const DIRECTIONS = { LEFT: { x: -1, y: 0 }, RIGHT: { x: 1, y: 0 }, TOP: { x: 0, y: -1 }, BOTTOM: { x: 0, y: 1 } } as const;
/** How far the frame underneath moves in a slide, as a share of the moving frame's travel. */
const SLIDE_PARALLAX = 0.3;
const STILL: LayerOffset = { dx: 0, dy: 0, alpha: 1 };

/**
 * Where the frame being left (`from`) and the destination (`to`) are at `progress` (eased, 0 → 1) of a transition, for
 * frames `size` large: Dissolve and Smart animate fade the destination in; Move in slides it in over the frame; Move
 * out slides the frame out over it; Push moves both; Slide in and Slide out also fade and offset the frame underneath.
 * The direction is where the moving frame travels.
 */
export function transitionOffsets(transition: PrototypeTransition, progress: number, size: Size): { from: LayerOffset; to: LayerOffset; toOnTop: boolean } {
  const p = progress;
  if (transition.type === 'INSTANT') return { from: { ...STILL, alpha: 0 }, to: STILL, toOnTop: true };
  if (!('direction' in transition)) return { from: STILL, to: { dx: 0, dy: 0, alpha: clamp01(p) }, toOnTop: true };
  const v = DIRECTIONS[transition.direction];
  // `+ 0` turns the -0 of an axis that doesn't move into 0.
  const leaving = (t: number, share = 1) => ({ dx: v.x * size.width * t * share + 0, dy: v.y * size.height * t * share + 0 });
  const entering = (t: number, share = 1) => ({ dx: -v.x * size.width * (1 - t) * share + 0, dy: -v.y * size.height * (1 - t) * share + 0 });
  switch (transition.type) {
    case 'MOVE_IN':
      return { from: STILL, to: { ...entering(p), alpha: 1 }, toOnTop: true };
    case 'MOVE_OUT':
      return { from: { ...leaving(p), alpha: 1 }, to: STILL, toOnTop: false };
    case 'PUSH':
      return { from: { ...leaving(p), alpha: 1 }, to: { ...entering(p), alpha: 1 }, toOnTop: true };
    case 'SLIDE_IN':
      return { from: { ...leaving(p, SLIDE_PARALLAX), alpha: 1 }, to: { ...entering(p), alpha: clamp01(p) }, toOnTop: true };
    case 'SLIDE_OUT':
      return { from: { ...leaving(p), alpha: clamp01(1 - p) }, to: { ...entering(p, SLIDE_PARALLAX), alpha: 1 }, toOnTop: false };
  }
}

/** A transition playing, at `progress` (eased) of its duration. */
export interface PlayingTransition {
  readonly effect: Extract<PlayerEffect, { type: 'transition' }>;
  readonly progress: number;
}

export type PresentedItem =
  /** A frame drawn at `scale`, its top-left at (x, y) in window pixels. */
  | {
      readonly kind: 'frame';
      readonly frameId: Id;
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
      readonly scale: number;
      readonly alpha: number;
      /** Smart animate: the frame is drawn `progress` of the way from the frame left, its matching layers blended. */
      readonly smart?: { readonly from: Id; readonly progress: number };
      /** Animate matching layers: the frame is drawn without its layers that match layers of this frame (they animate on their own). */
      readonly without?: Id;
      /** Animate matching layers: only the frame's layers matching the frame left, blended `progress` of the way from them. */
      readonly matched?: { readonly from: Id; readonly progress: number };
    }
  /** An overlay's background, over the screen. */
  | { readonly kind: 'dim'; readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly color: Color }
  /** The device the prototype plays in: its body and its screen (window pixels, with corner radii). */
  | { readonly kind: 'device'; readonly body: Rect; readonly bodyRadius: number; readonly screen: Rect; readonly screenRadius: number };

/** A device laid out in the window: its name, body and screen. */
export interface DeviceScreen {
  readonly name: string;
  readonly body: Rect;
  readonly bodyRadius: number;
  readonly screen: Rect;
  readonly screenRadius: number;
}

/** The screen's scale and the area it shows in: the device's screen (the frame filling its width), or the window. */
export function screenArea(scaling: ScalingMode, viewport: Size, frame: Size, device: DeviceScreen | null): { readonly scale: number; readonly area: Size } {
  if (!device) return { scale: screenScale(scaling, viewport, frame), area: viewport };
  return { scale: device.screen.width / Math.max(1, frame.width), area: { width: device.screen.width, height: device.screen.height } };
}

export interface PresentedScene {
  /** The screen's rectangle in the window (taller than the window when it scrolls) and its scale. */
  readonly screen: Rect & { readonly scale: number };
  /** What to draw, bottom to top. */
  readonly items: readonly PresentedItem[];
  /** In a device: the screen the frames are clipped to. */
  readonly clip?: { readonly rect: Rect; readonly radius: number };
}

const sizeOf = (store: DocumentStore, id: Id): Size => (store.get(id) as SceneNode | undefined)?.size ?? { width: 0, height: 0 };

/**
 * What presentation view draws: the screen centered in the window (scrolled when taller), overlays at their positions
 * over the part of the screen in view, with their backgrounds, and the frames of a transition that is playing.
 */
export function composeScene(store: DocumentStore, state: PlayerState, viewport: Size, scaling: ScalingMode, scrollY: number, playing: PlayingTransition | null, device: DeviceScreen | null = null): PresentedScene {
  const frame = sizeOf(store, state.frameId);
  // In a device, the screen fills the device's width (and scrolls when taller); otherwise it scales to the window.
  const { scale, area } = screenArea(scaling, viewport, frame, device);
  const width = frame.width * scale;
  const height = frame.height * scale;
  const x = (area.width - width) / 2;
  const fits = height <= area.height;
  const top = fits ? (area.height - height) / 2 : 0;
  const y = fits ? top : -scrollY * scale;
  const inView = { width, height: fits ? height : area.height };
  const items: PresentedItem[] = [];
  const place = (frameId: Id, left: number, upper: number, offset: LayerOffset, smart?: { from: Id; progress: number }, layers?: { without: Id } | { matched: { from: Id; progress: number } }) => {
    const size = sizeOf(store, frameId);
    items.push({ kind: 'frame', frameId, x: left + offset.dx, y: upper + offset.dy, width: size.width * scale, height: size.height * scale, scale, alpha: offset.alpha, ...(smart ? { smart } : {}), ...layers });
  };
  const smartAnimates = (playingTransition: PlayingTransition, from: Id, to: Id) => playingTransition.effect.transition.type === 'SMART_ANIMATE' && canSmartAnimate(store, from, to);

  const screenTransition = playing && !playing.effect.overlay && playing.effect.from && store.has(playing.effect.from) ? playing : null;
  if (screenTransition && smartAnimates(screenTransition, screenTransition.effect.from!, state.frameId)) {
    place(state.frameId, x, y, STILL, { from: screenTransition.effect.from!, progress: screenTransition.progress });
  } else if (screenTransition) {
    const from = screenTransition.effect.from!;
    const offsets = transitionOffsets(screenTransition.effect.transition, screenTransition.progress, inView);
    const fromSize = sizeOf(store, from);
    const fromLeft = (area.width - fromSize.width * scale) / 2;
    const fromTop = fromSize.height * scale <= area.height ? (area.height - fromSize.height * scale) / 2 : 0;
    const transition = screenTransition.effect.transition;
    // Animate matching layers: the frames move without their matching layers, which smart animate in place above them.
    const matching = 'matchLayers' in transition && transition.matchLayers && canSmartAnimate(store, from, state.frameId);
    const drawFrom = () => place(from, fromLeft, fromTop, offsets.from, undefined, matching ? { without: state.frameId } : undefined);
    const drawTo = () => place(state.frameId, x, y, offsets.to, undefined, matching ? { without: from } : undefined);
    if (offsets.toOnTop) {
      drawFrom();
      drawTo();
    } else {
      drawTo();
      drawFrom();
    }
    if (matching) place(state.frameId, x, y, STILL, undefined, { matched: { from, progress: screenTransition.progress } });
  } else {
    place(state.frameId, x, y, STILL);
  }

  const overlayTransition = playing?.effect.overlay ? playing : null;
  for (const overlayId of state.overlays) {
    const node = store.get(overlayId) as SceneNode | undefined;
    if (!node) continue;
    const settings = overlaySettings(node);
    const size = { width: node.size.width * scale, height: node.size.height * scale };
    const origin = overlayOrigin(settings.position, inView, size);
    const left = x + origin.x;
    const upper = top + origin.y;
    const animating = overlayTransition?.effect.to === overlayId ? overlayTransition : null;
    const offsets = animating ? transitionOffsets(animating.effect.transition, animating.progress, size) : null;
    if (settings.background) {
      // A new overlay's background fades in with it.
      const fade = animating && !animating.effect.from ? clamp01(animating.progress) : 1;
      items.push({ kind: 'dim', x, y: top, width: inView.width, height: inView.height, color: { ...settings.background, a: settings.background.a * fade } });
    }
    const swappedOut = animating?.effect.from && store.has(animating.effect.from) ? animating.effect.from : null;
    // Swapping overlays can smart animate between them (opening one can't).
    if (swappedOut && animating && smartAnimates(animating, swappedOut, overlayId)) {
      place(overlayId, left, upper, STILL, { from: swappedOut, progress: animating.progress });
      continue;
    }
    if (swappedOut && offsets && offsets.toOnTop) place(swappedOut, left, upper, offsets.from);
    place(overlayId, left, upper, offsets ? offsets.to : STILL);
    if (swappedOut && offsets && !offsets.toOnTop) place(swappedOut, left, upper, offsets.from);
  }
  if (!device) return { screen: { x, y, width, height, scale }, items };
  // In a device, everything sits in its screen, drawn over the device body and clipped to the screen.
  const { x: ox, y: oy } = device.screen;
  const inScreen = items.map((item): PresentedItem => (item.kind === 'device' ? item : { ...item, x: item.x + ox, y: item.y + oy }));
  return {
    screen: { x: x + ox, y: y + oy, width, height, scale },
    items: [{ kind: 'device', body: device.body, bodyRadius: device.bodyRadius, screen: device.screen, screenRadius: device.screenRadius }, ...inScreen],
    clip: { rect: device.screen, radius: device.screenRadius },
  };
}

/** The shown frame under a window point (the topmost: overlays over the screen), with the point in the frame's coordinates. */
export function frameAtPoint(scene: PresentedScene, state: PlayerState, point: Vec2): { readonly frameId: Id; readonly local: Vec2 } | null {
  const shown = new Set([state.frameId, ...state.overlays]);
  for (let i = scene.items.length - 1; i >= 0; i--) {
    const item = scene.items[i]!;
    if (item.kind !== 'frame' || !shown.has(item.frameId) || item.alpha <= 0) continue;
    if (point.x >= item.x && point.y >= item.y && point.x <= item.x + item.width && point.y <= item.y + item.height) {
      return { frameId: item.frameId, local: { x: (point.x - item.x) / item.scale, y: (point.y - item.y) / item.scale } };
    }
  }
  return null;
}

/** The window rectangles of layers in a drawn frame (hotspot hints). */
export function layerRects(index: SceneIndex, scene: PresentedScene, frameId: Id, ids: readonly Id[]): Rect[] {
  const item = scene.items.find((candidate): candidate is Extract<PresentedItem, { kind: 'frame' }> => candidate.kind === 'frame' && candidate.frameId === frameId);
  const frame = index.worldBounds(frameId);
  if (!item || !frame) return [];
  return ids.flatMap((id) => {
    const bounds = index.worldBounds(id);
    return bounds ? [{ x: item.x + (bounds.x - frame.x) * item.scale, y: item.y + (bounds.y - frame.y) * item.scale, width: bounds.width * item.scale, height: bounds.height * item.scale }] : [];
  });
}

/** How far the screen scrolls to bring a layer in it to the top, in the screen's coordinates. */
export function scrollOffsetOf(index: SceneIndex, screenId: Id, nodeId: Id): number | null {
  const screen = index.worldBounds(screenId);
  const node = index.worldBounds(nodeId);
  return screen && node ? node.y - screen.y : null;
}
