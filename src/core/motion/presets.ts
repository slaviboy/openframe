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

import type { AnimatedProperty, KeyframeEasing } from '../schema/document';

/** How long a preset animation runs when it is added, in milliseconds. */
export const PRESET_DURATION = 500;

/** How far a slide moves, and how far a scale grows, in the layer's own units and share. */
const SLIDE_DISTANCE = 100;
const SCALE_FACTOR = 0.5;

/** What a layer is before the preset touches it: the values its keyframes are worked out from. */
export interface PresetBase {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
  readonly opacity: number;
  readonly trimStart: number;
  readonly trimEnd: number;
}

/** One step a preset writes: a property, and its value at the start and the end of the run. */
export interface PresetStep {
  readonly property: AnimatedProperty;
  readonly from: number;
  readonly to: number;
  readonly easing?: KeyframeEasing;
}

export interface MotionPreset {
  readonly id: string;
  readonly label: string;
  /** A composite style is several of the plain presets at once. */
  readonly composite?: boolean;
  /** Path trim presets need a path stroked down its middle, so they are offered on one alone. */
  readonly needsTrim?: boolean;
  steps(base: PresetBase): PresetStep[];
}

const fadeIn: MotionPreset = {
  id: 'FADE_IN',
  label: 'Fade in',
  steps: (base) => [{ property: 'opacity', from: 0, to: base.opacity, easing: { type: 'EASE_OUT' } }],
};

const fadeOut: MotionPreset = {
  id: 'FADE_OUT',
  label: 'Fade out',
  steps: (base) => [{ property: 'opacity', from: base.opacity, to: 0, easing: { type: 'EASE_IN' } }],
};

const slideIn: MotionPreset = {
  id: 'SLIDE_IN',
  label: 'Slide in',
  steps: (base) => [{ property: 'x', from: base.x - SLIDE_DISTANCE, to: base.x, easing: { type: 'EASE_OUT' } }],
};

const slideOut: MotionPreset = {
  id: 'SLIDE_OUT',
  label: 'Slide out',
  steps: (base) => [{ property: 'x', from: base.x, to: base.x + SLIDE_DISTANCE, easing: { type: 'EASE_IN' } }],
};

const scaleUp: MotionPreset = {
  id: 'SCALE_UP',
  label: 'Scale up',
  steps: (base) => [
    { property: 'width', from: base.width * SCALE_FACTOR, to: base.width, easing: { type: 'EASE_OUT' } },
    { property: 'height', from: base.height * SCALE_FACTOR, to: base.height, easing: { type: 'EASE_OUT' } },
  ],
};

const scaleDown: MotionPreset = {
  id: 'SCALE_DOWN',
  label: 'Scale down',
  steps: (base) => [
    { property: 'width', from: base.width, to: base.width * SCALE_FACTOR, easing: { type: 'EASE_IN' } },
    { property: 'height', from: base.height, to: base.height * SCALE_FACTOR, easing: { type: 'EASE_IN' } },
  ],
};

const spin: MotionPreset = {
  id: 'SPIN',
  label: 'Spin',
  steps: (base) => [{ property: 'rotation', from: base.rotation, to: base.rotation - 360 }],
};

/** Path trim: the stroke draws itself on, its end travelling from where the trim starts to where it ends. */
const path: MotionPreset = {
  id: 'PATH',
  label: 'Path',
  needsTrim: true,
  steps: (base) => [{ property: 'trimEnd', from: base.trimStart, to: base.trimEnd, easing: { type: 'EASE_OUT' } }],
};

/** Composite styles: several presets at once, for motion with more to it than one property. */
const popIn: MotionPreset = {
  id: 'POP_IN',
  label: 'Pop in',
  composite: true,
  steps: (base) => [...fadeIn.steps(base), ...scaleUp.steps(base).map((step) => ({ ...step, easing: { type: 'BOUNCY' } as KeyframeEasing }))],
};

const flyIn: MotionPreset = {
  id: 'FLY_IN',
  label: 'Fly in',
  composite: true,
  steps: (base) => [...fadeIn.steps(base), ...slideIn.steps(base)],
};

/** The preset animations offered in the Animations section, the composite styles last. */
export const MOTION_PRESETS: readonly MotionPreset[] = [fadeIn, fadeOut, slideIn, slideOut, scaleUp, scaleDown, spin, path, popIn, flyIn];

export const presetById = (id: string): MotionPreset | undefined => MOTION_PRESETS.find((preset) => preset.id === id);
