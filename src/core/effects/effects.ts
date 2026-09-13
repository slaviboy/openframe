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

import type { Effect, EffectType, ShadowEffect } from '../schema/document';

export const EFFECT_TYPE_LABELS: Record<EffectType, string> = {
  DROP_SHADOW: 'Drop shadow',
  INNER_SHADOW: 'Inner shadow',
  LAYER_BLUR: 'Layer blur',
  BACKGROUND_BLUR: 'Background blur',
};

export const EFFECT_TYPES: readonly EffectType[] = ['DROP_SHADOW', 'INNER_SHADOW', 'LAYER_BLUR', 'BACKGROUND_BLUR'];

export const isShadow = (effect: Effect): effect is ShadowEffect => effect.type === 'DROP_SHADOW' || effect.type === 'INNER_SHADOW';

/** New effects: a soft 25% black shadow 4px down, or a 4px blur. */
export function defaultEffect(type: EffectType): Effect {
  const shadow = { color: { r: 0, g: 0, b: 0, a: 0.25 }, offset: { x: 0, y: 4 }, radius: 4, spread: 0, visible: true, blendMode: 'NORMAL' as const };
  switch (type) {
    case 'DROP_SHADOW':
      return { type, ...shadow, showShadowBehindNode: false };
    case 'INNER_SHADOW':
      return { type, ...shadow };
    case 'LAYER_BLUR':
    case 'BACKGROUND_BLUR':
      return { type, radius: 4, visible: true };
  }
}

/** Changes an effect's type, keeping every setting the two types share. */
export function convertEffect(effect: Effect, type: EffectType): Effect {
  if (effect.type === type) return effect;
  const next = defaultEffect(type);
  if (isShadow(effect) && isShadow(next)) {
    const { color, offset, radius, spread, visible, blendMode } = effect;
    const shared = { color, offset, radius, spread, visible, blendMode };
    return next.type === 'DROP_SHADOW' ? { ...next, ...shared } : { ...next, ...shared };
  }
  return { ...next, radius: effect.radius, visible: effect.visible } as Effect;
}

/** How far visible effects extend beyond a layer's geometry (for culling and invalidation). */
export function effectOutset(effects: readonly Effect[] | undefined): number {
  let outset = 0;
  for (const effect of effects ?? []) {
    if (!effect.visible) continue;
    if (effect.type === 'DROP_SHADOW') {
      outset = Math.max(outset, Math.max(Math.abs(effect.offset.x), Math.abs(effect.offset.y)) + effect.radius + Math.max(0, effect.spread));
    } else if (effect.type === 'LAYER_BLUR') {
      outset = Math.max(outset, effect.radius);
    }
  }
  return outset;
}

/** Blur radius in design pixels → Gaussian sigma. */
export const blurSigma = (radius: number): number => Math.max(0, radius / 2);
