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
import type { Vec2 } from '../math/vec';
import type { Id } from '../ids/ids';
import { nodeContainsLocal, type SceneIndex } from '../scene/scene-index';
import { hasGeometry, isSceneNode } from '../schema/document';
import { contrastRatio, hslToRgb, rgbToHsl, type RGBA } from './color';

export type ContrastCategory = 'AUTO' | 'LARGE_TEXT' | 'NORMAL_TEXT' | 'GRAPHICS';
export type ContrastLevel = 'AA' | 'AAA';

export const CONTRAST_CATEGORY_LABELS: Record<ContrastCategory, string> = {
  AUTO: 'Auto',
  LARGE_TEXT: 'Large text',
  NORMAL_TEXT: 'Normal text',
  GRAPHICS: 'Graphics',
};

/** Auto follows the selected layer: text layers (M4) will pick a text size; every other layer is a graphic. */
export const resolveContrastCategory = (category: ContrastCategory): Exclude<ContrastCategory, 'AUTO'> => (category === 'AUTO' ? 'GRAPHICS' : category);

/** WCAG 2.x minimum ratio for a category and level, or null when the level doesn't apply (AAA is text-only). */
export function requiredContrast(category: Exclude<ContrastCategory, 'AUTO'>, level: ContrastLevel): number | null {
  switch (category) {
    case 'NORMAL_TEXT':
      return level === 'AA' ? 4.5 : 7;
    case 'LARGE_TEXT':
      return level === 'AA' ? 3 : 4.5;
    case 'GRAPHICS':
      return level === 'AA' ? 3 : null;
  }
}

/** "4.52:1" — truncated to two decimals so a failing ratio never reads as passing. */
export const formatContrastRatio = (ratio: number): string => `${(Math.floor(ratio * 100) / 100).toFixed(2)}:1`;

const quantize = (c: RGBA): RGBA => ({ r: Math.round(c.r * 255) / 255, g: Math.round(c.g * 255) / 255, b: Math.round(c.b * 255) / 255, a: c.a });

/**
 * The closest color (by HSL lightness, keeping hue and saturation) that reaches `target` against
 * `bg`, choosing the darker or lighter direction with the smaller change. Returns `fg` when it
 * already passes and null when no lightness reaches the target.
 */
export function nearestCompliantColor(fg: RGBA, bg: RGBA, target: number): RGBA | null {
  const opaque = { ...fg, a: 1 };
  if (contrastRatio(opaque, bg) >= target) return fg;
  const hsl = rgbToHsl(opaque);
  const search = (towards: 0 | 1): { color: RGBA; distance: number } | null => {
    if (contrastRatio(hslToRgb({ ...hsl, l: towards }), bg) < target) return null;
    let fail = hsl.l;
    let pass: number = towards;
    for (let i = 0; i < 32; i++) {
      const mid = (fail + pass) / 2;
      if (contrastRatio(hslToRgb({ ...hsl, l: mid }), bg) >= target) pass = mid;
      else fail = mid;
    }
    // Rounding to 8-bit channels can dip below the target; step further until it holds.
    let l = pass;
    let color = quantize(hslToRgb({ ...hsl, l }));
    while (contrastRatio(color, bg) < target && l !== towards) {
      l = towards === 0 ? Math.max(0, l - 0.002) : Math.min(1, l + 0.002);
      color = quantize(hslToRgb({ ...hsl, l }));
    }
    return contrastRatio(color, bg) >= target ? { color: { ...color, a: fg.a }, distance: Math.abs(l - hsl.l) } : null;
  };
  const darker = search(0);
  const lighter = search(1);
  if (!darker || !lighter) return (darker ?? lighter)?.color ?? null;
  return darker.distance <= lighter.distance ? darker.color : lighter.color;
}

/**
 * The opaque color behind a layer's center: the page background with every visible layer painted
 * before it (ancestors included) that covers the point composited on top, using each layer's top
 * visible solid fill and its opacity. Image and gradient fills are skipped.
 */
export function backgroundColorBehind(store: DocumentStore, index: SceneIndex, pageId: Id, nodeId: Id): RGBA {
  index.ensure(pageId);
  const bounds = index.worldBounds(nodeId);
  if (!bounds) return pageColor(store, pageId);
  return backgroundColorAt(store, index, pageId, { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }, nodeId);
}

/** The page's own canvas color, which everything else is painted on. */
const pageColor = (store: DocumentStore, pageId: Id): RGBA => {
  const page = store.get(pageId);
  return page?.type === 'PAGE' ? { ...page.backgroundColor, a: 1 } : { r: 1, g: 1, b: 1, a: 1 };
};

/**
 * The opaque color behind a point on the canvas: the page background with every visible layer covering the point
 * painted on top, in order, up to `before` when one is given. Image and gradient fills are skipped.
 */
export function backgroundColorAt(store: DocumentStore, index: SceneIndex, pageId: Id, point: Vec2, before?: Id): RGBA {
  let result: RGBA = pageColor(store, pageId);
  index.ensure(pageId);
  const hidden = new Set<Id>();
  for (const id of store.descendants(pageId, false)) {
    if (id === before) break;
    const node = store.get(id);
    if (!node || !isSceneNode(node)) continue;
    const parent = store.parentOf(id);
    if (!node.visible || (parent !== null && hidden.has(parent))) {
      hidden.add(id);
      continue;
    }
    if (!hasGeometry(node) || node.type === 'LINE') continue;
    const local = index.toLocal(id, point);
    if (!local || !nodeContainsLocal(node, local, 0)) continue;
    for (const paint of node.fills) {
      if (!paint.visible || paint.type !== 'SOLID') continue;
      const alpha = Math.min(1, Math.max(0, paint.opacity * paint.color.a * node.opacity));
      result = {
        r: paint.color.r * alpha + result.r * (1 - alpha),
        g: paint.color.g * alpha + result.g * (1 - alpha),
        b: paint.color.b * alpha + result.b * (1 - alpha),
        a: 1,
      };
    }
  }
  return result;
}
