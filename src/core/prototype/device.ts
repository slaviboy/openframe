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
import type { SceneNode, Size } from '../schema/document';
import { presentableFrames } from './player';

/** The device a prototype plays in: a device preset (portrait or landscape), a custom size that fits the window, the full presentation, or none. */
export type PrototypeDevice =
  | { readonly kind: 'PRESET'; readonly preset: FramePreset; readonly landscape: boolean; readonly explicit: boolean }
  | { readonly kind: 'CUSTOM' | 'PRESENTATION' | 'NONE'; readonly explicit: boolean };

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
    return preset ? { kind: 'PRESET', preset, landscape, explicit: true } : { kind: 'NONE', explicit: true };
  }
  const first = presentableFrames(store, pageId)[0];
  const frame = first ? (store.get(first) as SceneNode | undefined) : undefined;
  const match = frame ? presetForSize(frame.size.width, frame.size.height, DEVICE_CATEGORIES) : null;
  return match ? { kind: 'PRESET', preset: match.preset, landscape: match.landscape, explicit: false } : { kind: 'NONE', explicit: false };
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

/** A device scaled to fit in the window with a margin around it, centered. */
export function deviceLayout(device: Extract<PrototypeDevice, { kind: 'PRESET' }>, viewport: Size, margin = 24): DeviceLayout {
  const screen = deviceScreenSize(device);
  const body = BODY[device.preset.category];
  const short = Math.min(screen.width, screen.height);
  const bezel = short * body.bezel;
  const outer = { width: screen.width + bezel * 2, height: screen.height + bezel * 2 };
  const scale = Math.max(0.01, Math.min((viewport.width - margin * 2) / outer.width, (viewport.height - margin * 2) / outer.height));
  const bodyRect = { x: (viewport.width - outer.width * scale) / 2, y: (viewport.height - outer.height * scale) / 2, width: outer.width * scale, height: outer.height * scale };
  return {
    body: bodyRect,
    bodyRadius: short * body.radius * scale,
    screen: { x: bodyRect.x + bezel * scale, y: bodyRect.y + bezel * scale, width: screen.width * scale, height: screen.height * scale },
    screenRadius: Math.max(0, short * body.radius - bezel) * scale,
  };
}
