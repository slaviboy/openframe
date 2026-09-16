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

import { DEVICE_CATEGORIES, presetById, presetForSize, type FramePreset, type FramePresetCategory } from '../document/frame-presets';
import type { DocumentStore } from '../document/store';
import type { Id } from '../ids/ids';
import type { Rect } from '../math/rect';
import type { Color, PageNode, SceneNode, Size } from '../schema/document';
import { presentableFrames } from './player';

/** The device a prototype plays in: a device preset (portrait or landscape), a custom size that fits the window, the full presentation, or none. */
export type PrototypeDevice =
  | { readonly kind: 'PRESET'; readonly preset: FramePreset; readonly landscape: boolean; readonly model: DeviceModel; readonly explicit: boolean }
  | { readonly kind: 'CUSTOM' | 'PRESENTATION' | 'NONE'; readonly explicit: boolean };

/** A device's model: the color of its body (Openframe draws its own devices, so models are colors rather than products). */
export type DeviceModel = NonNullable<NonNullable<PageNode['prototypeDevice']>['model']>;

export const DEVICE_MODELS: readonly DeviceModel[] = ['BLACK', 'SILVER', 'GOLD', 'BLUE'];

export const DEVICE_MODEL_LABELS: Readonly<Record<DeviceModel, string>> = { BLACK: 'Black', SILVER: 'Silver', GOLD: 'Gold', BLUE: 'Blue' };

const MODEL_COLORS: Readonly<Record<DeviceModel, { readonly body: Color; readonly edge: Color }>> = {
  BLACK: { body: { r: 0.08, g: 0.08, b: 0.09, a: 1 }, edge: { r: 0.36, g: 0.36, b: 0.4, a: 1 } },
  SILVER: { body: { r: 0.82, g: 0.83, b: 0.85, a: 1 }, edge: { r: 0.62, g: 0.63, b: 0.66, a: 1 } },
  GOLD: { body: { r: 0.85, g: 0.76, b: 0.6, a: 1 }, edge: { r: 0.66, g: 0.57, b: 0.42, a: 1 } },
  BLUE: { body: { r: 0.2, g: 0.29, b: 0.42, a: 1 }, edge: { r: 0.4, g: 0.5, b: 0.64, a: 1 } },
};

/** The colors a device of a model is drawn with: its body, and the thin edge around it. */
export function deviceBodyColors(model: DeviceModel): { readonly body: Color; readonly edge: Color } {
  return MODEL_COLORS[model];
}

/**
 * The page's prototype device: its setting, or when it has none and its first screen has a device preset's size, that
 * device (in the frame's orientation); otherwise none.
 */
export function effectiveDevice(store: DocumentStore, pageId: Id): PrototypeDevice {
  const page = store.get(pageId);
  if (page?.type !== 'PAGE') return { kind: 'NONE', explicit: false };
  const setting = page.prototypeDevice;
  if (setting) {
    const landscape = setting.rotation === 'CCW_90';
    if (setting.type !== 'PRESET') return { kind: setting.type, explicit: true };
    const preset = presetById(setting.presetId);
    return preset ? { kind: 'PRESET', preset, landscape, model: setting.model ?? 'BLACK', explicit: true } : { kind: 'NONE', explicit: true };
  }
  const first = presentableFrames(store, pageId)[0];
  const frame = first ? (store.get(first) as SceneNode | undefined) : undefined;
  const match = frame ? presetForSize(frame.size.width, frame.size.height, DEVICE_CATEGORIES) : null;
  return match ? { kind: 'PRESET', preset: match.preset, landscape: match.landscape, model: 'BLACK', explicit: false } : { kind: 'NONE', explicit: false };
}

/** The size of a device preset's screen, turned for landscape. */
export function deviceScreenSize(device: Extract<PrototypeDevice, { kind: 'PRESET' }>): Size {
  const { width, height } = device.preset;
  return device.landscape ? { width: height, height: width } : { width, height };
}

/** Bezel thickness and corner roundness of each kind of device, as shares of the screen's shorter side. */
const BODY: Readonly<Record<FramePresetCategory, { readonly bezel: number; readonly radius: number }>> = {
  Phone: { bezel: 0.045, radius: 0.16 },
  Tablet: { bezel: 0.04, radius: 0.05 },
  Watch: { bezel: 0.12, radius: 0.3 },
  Desktop: { bezel: 0.02, radius: 0.015 },
  Presentation: { bezel: 0, radius: 0 },
  Paper: { bezel: 0, radius: 0 },
  'Social media': { bezel: 0, radius: 0 },
};

/** Where a device and its screen sit in a window (CSS pixels): the device body, its corner radius, the screen and the screen's corner radius. */
export interface DeviceLayout {
  readonly body: Rect;
  readonly bodyRadius: number;
  readonly screen: Rect;
  readonly screenRadius: number;
}

/** A device's size at 100%: its screen with the body's bezel around it. */
export function deviceOuterSize(device: Extract<PrototypeDevice, { kind: 'PRESET' }>): Size {
  const screen = deviceScreenSize(device);
  const bezel = Math.min(screen.width, screen.height) * BODY[device.preset.category].bezel;
  return { width: screen.width + bezel * 2, height: screen.height + bezel * 2 };
}

/** How presentation view's device switcher shows the device: fitting the window, filling it, or at its own size. */
export type DeviceFit = 'FIT' | 'FILL' | 'ACTUAL';

/** The device scaling options, in the order Z moves through them. */
export const DEVICE_FITS: readonly DeviceFit[] = ['FIT', 'FILL', 'ACTUAL'];

export const DEVICE_FIT_LABELS: Readonly<Record<DeviceFit, string>> = { FIT: 'Fit device on screen', FILL: 'Zoom device to fill screen', ACTUAL: 'Show device at 100%' };

/**
 * A device laid out in the window, centered: scaled to fit with a margin around it (Fit device on screen), to fill the
 * window (Zoom device to fill screen, cropped where it overflows) or at 100%. Without its frame, the screen alone shows.
 */
export function deviceLayout(device: Extract<PrototypeDevice, { kind: 'PRESET' }>, viewport: Size, margin = 24, options: { readonly fit?: DeviceFit; readonly frame?: boolean } = {}): DeviceLayout {
  const screen = deviceScreenSize(device);
  const body = BODY[device.preset.category];
  const frame = options.frame ?? true;
  const short = Math.min(screen.width, screen.height);
  const bezel = frame ? short * body.bezel : 0;
  const radius = frame ? short * body.radius : 0;
  const outer = { width: screen.width + bezel * 2, height: screen.height + bezel * 2 };
  const fit = options.fit ?? 'FIT';
  const scale =
    fit === 'ACTUAL'
      ? 1
      : fit === 'FILL'
        ? Math.max(viewport.width / outer.width, viewport.height / outer.height)
        : Math.max(0.01, Math.min((viewport.width - margin * 2) / outer.width, (viewport.height - margin * 2) / outer.height));
  const bodyRect = { x: (viewport.width - outer.width * scale) / 2, y: (viewport.height - outer.height * scale) / 2, width: outer.width * scale, height: outer.height * scale };
  return {
    body: bodyRect,
    bodyRadius: radius * scale,
    screen: { x: bodyRect.x + bezel * scale, y: bodyRect.y + bezel * scale, width: screen.width * scale, height: screen.height * scale },
    screenRadius: Math.max(0, radius - bezel) * scale,
  };
}
