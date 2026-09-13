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

/** How many effects of each type one layer can have. */
export const EFFECT_LIMITS: Readonly<Record<EffectType, number>> = { DROP_SHADOW: 8, INNER_SHADOW: 8, LAYER_BLUR: 1, BACKGROUND_BLUR: 1 };

/** The effects that take part in rendering: the first ones of each type, up to its limit, in list order. */
export function limitEffects(effects: readonly Effect[]): Effect[] {
  const counts: Partial<Record<EffectType, number>> = {};
  return effects.filter((effect) => {
    const count = (counts[effect.type] ?? 0) + 1;
    counts[effect.type] = count;
    return count <= EFFECT_LIMITS[effect.type];
  });
}

/** Whether another effect of `type` fits under its limit. */
export const canAddEffect = (effects: readonly Effect[], type: EffectType): boolean =>
  effects.filter((e) => e.type === type).length < EFFECT_LIMITS[type];

/** The type the Add effect button creates: a drop shadow when there is room, otherwise the first type with room. */
export const nextEffectType = (effects: readonly Effect[]): EffectType | null => EFFECT_TYPES.find((type) => canAddEffect(effects, type)) ?? null;

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
  for (const effect of limitEffects(effects ?? [])) {
    if (!effect.visible) continue;
    if (effect.type === 'DROP_SHADOW') {
      outset = Math.max(outset, Math.max(Math.abs(effect.offset.x), Math.abs(effect.offset.y)) + effect.radius + Math.max(0, effect.spread));
    } else if (effect.type === 'LAYER_BLUR') {
      outset = Math.max(outset, maxBlurRadius(effect));
    }
  }
  return outset;
}

export type BlurEffect = Extract<Effect, { type: 'LAYER_BLUR' | 'BACKGROUND_BLUR' }>;
export type BlurType = NonNullable<BlurEffect['blurType']>;

export const isBlur = (effect: Effect): effect is BlurEffect => effect.type === 'LAYER_BLUR' || effect.type === 'BACKGROUND_BLUR';
export const isProgressiveBlur = (effect: BlurEffect): boolean => effect.blurType === 'PROGRESSIVE';

/** A new progressive blur ramps from sharp at the top to the blur radius at the bottom. */
export const DEFAULT_START_OFFSET = { x: 0.5, y: 0 };
export const DEFAULT_END_OFFSET = { x: 0.5, y: 1 };

/** The largest radius a blur reaches. */
export const maxBlurRadius = (effect: BlurEffect): number => (isProgressiveBlur(effect) ? Math.max(effect.radius, effect.startRadius ?? 0) : effect.radius);

/** Start and end points of a progressive blur, as fractions of the layer box. */
export const blurOffsets = (effect: BlurEffect) => ({ start: effect.startOffset ?? DEFAULT_START_OFFSET, end: effect.endOffset ?? DEFAULT_END_OFFSET });

/** Switches a blur between uniform and progressive; uniform blurs carry no progressive settings. */
export function setBlurType(effect: BlurEffect, type: BlurType): BlurEffect {
  const { blurType: _type, startRadius, startOffset, endOffset, ...base } = effect;
  if (type === 'NORMAL') return base;
  return { ...base, blurType: 'PROGRESSIVE', startRadius: startRadius ?? 0, startOffset: startOffset ?? DEFAULT_START_OFFSET, endOffset: endOffset ?? DEFAULT_END_OFFSET };
}

/** One blur level of a progressive blur: its radius and the gradient stops (along start → end) that weight it. */
export interface BlurLevel {
  readonly radius: number;
  readonly stops: readonly { readonly position: number; readonly alpha: number }[];
}

/**
 * A progressive blur is drawn as a few uniform blurs, blended along the blur direction with
 * overlapping "hat" weights that sum to 1 everywhere: at position t (0 at the start, 1 at the end)
 * the two levels nearest to t mix linearly. More levels are used for larger radius ranges (2–8).
 */
export function progressiveBlurLevels(effect: BlurEffect): BlurLevel[] {
  const from = effect.startRadius ?? 0;
  const to = effect.radius;
  const count = Math.max(2, Math.min(8, Math.ceil(Math.abs(to - from) / 8) + 1));
  const at = (k: number) => k / (count - 1);
  return Array.from({ length: count }, (_, i) => ({
    radius: from + (to - from) * at(i),
    stops:
      i === 0
        ? [
            { position: 0, alpha: 1 },
            { position: at(1), alpha: 0 },
          ]
        : i === count - 1
          ? [
              { position: at(count - 2), alpha: 0 },
              { position: 1, alpha: 1 },
            ]
          : [
              { position: at(i - 1), alpha: 0 },
              { position: at(i), alpha: 1 },
              { position: at(i + 1), alpha: 0 },
            ],
  }));
}

/** A level's weight at position t (clamped to 0–1), interpolating its stops like a clamped linear gradient. */
export function levelWeight(level: BlurLevel, t: number): number {
  const p = Math.min(1, Math.max(0, t));
  const stops = level.stops;
  if (p <= stops[0]!.position) return stops[0]!.alpha;
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1]!;
    const b = stops[i]!;
    if (p <= b.position) return a.alpha + ((b.alpha - a.alpha) * (p - a.position)) / (b.position - a.position || 1);
  }
  return stops.at(-1)!.alpha;
}

/** Blur radius in design pixels → Gaussian sigma. */
export const blurSigma = (radius: number): number => Math.max(0, radius / 2);
