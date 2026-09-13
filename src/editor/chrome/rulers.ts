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

/** Thickness of the top and left rulers, in CSS pixels. */
export const RULER_SIZE = 20;

/** Smallest 1/2/5 × 10ⁿ world step whose on-screen spacing is at least `minPx`. */
export function rulerStep(zoom: number, minPx = 50): number {
  const raw = minPx / zoom;
  const base = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 5]) if (m * base >= raw * (1 - 1e-9)) return m * base;
  return 10 * base;
}

export interface RulerTick {
  /** World coordinate of the tick. */
  readonly world: number;
  /** Screen offset along the ruler, in CSS pixels. */
  readonly screen: number;
  /** Major ticks carry a label. */
  readonly label: string | null;
}

const formatLabel = (v: number): string => {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? '0' : String(r);
};

/**
 * Ticks for a ruler covering screen offsets [0, lengthPx), where world = screen / zoom + origin.
 * Major ticks are labeled every `rulerStep`; minor ticks subdivide them into fifths (or halves)
 * when those stay at least 4px apart.
 */
export function rulerTicks(origin: number, zoom: number, lengthPx: number, minPx = 50): RulerTick[] {
  const step = rulerStep(zoom, minPx);
  const parts = (step * zoom) / 5 >= 4 ? 5 : (step * zoom) / 2 >= 4 ? 2 : 1;
  const minor = step / parts;
  const end = origin + lengthPx / zoom;
  const ticks: RulerTick[] = [];
  for (let i = Math.ceil(origin / minor); i * minor < end; i++) {
    const world = i * minor;
    ticks.push({ world, screen: (world - origin) * zoom, label: i % parts === 0 ? formatLabel(world) : null });
  }
  return ticks;
}
