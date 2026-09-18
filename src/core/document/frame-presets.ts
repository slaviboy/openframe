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

/** Frame preset categories, in the order the Frame tool lists them. */
export const FRAME_PRESET_CATEGORIES = ['Phone', 'Tablet', 'Desktop', 'Presentation', 'Watch', 'Paper', 'Social media', 'Archive'] as const;
export type FramePresetCategory = (typeof FRAME_PRESET_CATEGORIES)[number];

/** A frame size for a device or an asset template (in CSS pixels, or points for paper), in portrait. */
export interface FramePreset {
  readonly id: string;
  readonly category: FramePresetCategory;
  readonly name: string;
  readonly width: number;
  readonly height: number;
}

const preset = (category: FramePresetCategory, name: string, width: number, height: number): FramePreset => ({
  id: `${category}/${name}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
  category,
  name,
  width,
  height,
});

export const FRAME_PRESETS: readonly FramePreset[] = [
  preset('Phone', 'iPhone 16', 393, 852),
  preset('Phone', 'iPhone 16 Plus', 430, 932),
  preset('Phone', 'iPhone 16 Pro', 402, 874),
  preset('Phone', 'iPhone 16 Pro Max', 440, 956),
  preset('Phone', 'iPhone 13 mini', 375, 812),
  preset('Phone', 'iPhone SE', 320, 568),
  preset('Phone', 'Android Compact', 412, 917),
  preset('Phone', 'Android Medium', 700, 840),
  preset('Tablet', 'iPad mini 8.3', 744, 1133),
  preset('Tablet', 'iPad Pro 11"', 834, 1194),
  preset('Tablet', 'iPad Pro 12.9"', 1024, 1366),
  preset('Tablet', 'Surface Pro 8', 1440, 960),
  preset('Tablet', 'Android Expanded', 1280, 800),
  preset('Desktop', 'MacBook Air', 1280, 832),
  preset('Desktop', 'MacBook Pro 14"', 1512, 982),
  preset('Desktop', 'MacBook Pro 16"', 1728, 1117),
  preset('Desktop', 'Desktop', 1440, 1024),
  preset('Desktop', 'Wireframe', 1440, 1024),
  preset('Desktop', 'TV', 1280, 720),
  preset('Presentation', 'Slide 16:9', 1920, 1080),
  preset('Presentation', 'Slide 4:3', 1024, 768),
  preset('Watch', 'Apple Watch 40mm', 162, 197),
  preset('Watch', 'Apple Watch 41mm', 176, 215),
  preset('Watch', 'Apple Watch 44mm', 184, 224),
  preset('Watch', 'Apple Watch 45mm', 198, 242),
  preset('Watch', 'Apple Watch Ultra', 205, 251),
  preset('Paper', 'A4', 595, 842),
  preset('Paper', 'A5', 420, 595),
  preset('Paper', 'A6', 297, 420),
  preset('Paper', 'Letter', 612, 792),
  preset('Paper', 'Tabloid', 792, 1224),
  preset('Social media', 'Twitter post', 1200, 675),
  preset('Social media', 'Twitter header', 1500, 500),
  preset('Social media', 'Facebook post', 1200, 630),
  preset('Social media', 'Facebook cover', 820, 312),
  preset('Social media', 'Instagram post', 1080, 1080),
  preset('Social media', 'Instagram story', 1080, 1920),
  preset('Social media', 'Dribbble shot', 400, 300),
  preset('Social media', 'Dribbble shot HD', 800, 600),
  preset('Social media', 'LinkedIn cover', 1584, 396),
  // Archive: devices that have been superseded, kept for designs that still target them.
  preset('Archive', 'iPhone 8', 375, 667),
  preset('Archive', 'iPhone 8 Plus', 414, 736),
  preset('Archive', 'iPhone X', 375, 812),
  preset('Archive', 'iPhone 11 Pro Max', 414, 896),
  preset('Archive', 'iPhone 14', 390, 844),
  preset('Archive', 'Google Pixel 2', 411, 731),
  preset('Archive', 'Android 1080p', 360, 640),
  preset('Archive', 'iPad Pro 10.5"', 834, 1112),
  preset('Archive', 'Macbook', 1152, 700),
  preset('Archive', 'Surface Book', 1500, 1000),
];

/** Categories whose presets are devices a prototype can play in. */
export const DEVICE_CATEGORIES: ReadonlySet<FramePresetCategory> = new Set(['Phone', 'Tablet', 'Desktop', 'Watch']);
/** Device categories inline preview shows a device for (phones, tablets and watches). */
export const MOBILE_DEVICE_CATEGORIES: ReadonlySet<FramePresetCategory> = new Set(['Phone', 'Tablet', 'Watch']);

export const presetById = (id: string | undefined): FramePreset | undefined => FRAME_PRESETS.find((candidate) => candidate.id === id);

/** The presets of a category. */
export const presetsIn = (category: FramePresetCategory): FramePreset[] => FRAME_PRESETS.filter((candidate) => candidate.category === category);

/**
 * The first preset with a frame's size, and whether the frame is that preset turned to landscape; null when no preset
 * has the size. `categories` limits the search (e.g. to devices).
 */
export function presetForSize(width: number, height: number, categories?: ReadonlySet<FramePresetCategory>): { readonly preset: FramePreset; readonly landscape: boolean } | null {
  const near = (a: number, b: number) => Math.abs(a - b) < 0.5;
  for (const candidate of FRAME_PRESETS) {
    if (categories && !categories.has(candidate.category)) continue;
    if (near(candidate.width, width) && near(candidate.height, height)) return { preset: candidate, landscape: false };
    if (candidate.width !== candidate.height && near(candidate.width, height) && near(candidate.height, width)) return { preset: candidate, landscape: true };
  }
  return null;
}
