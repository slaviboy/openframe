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

import { evaluateEasing, type Easing } from './easing';

/**
 * Easing graphs: time runs along the x axis from 0 to 1 and the animation along the y axis, from its start (0) to its
 * end (1), overshooting past them for back curves and springs.
 */

/** A point on an easing curve: `t` through the time, `value` through the animation. */
export interface CurvePoint {
  readonly t: number;
  readonly value: number;
}

/** Lowest and highest values a Bézier handle can be dragged to in the graph. */
export const GRAPH_MIN = -0.5;
export const GRAPH_MAX = 1.5;

/** An easing's curve, sampled evenly over its time (a spring over the time it takes to settle). */
export function easingCurve(easing: Easing, samples = 48): CurvePoint[] {
  return Array.from({ length: samples + 1 }, (_, i) => {
    const t = i / samples;
    return { t, value: evaluateEasing(easing, t) };
  });
}

/** The values a graph shows: 0 to 1, widened to the curve's overshoot. */
export function curveRange(points: readonly CurvePoint[]): { readonly min: number; readonly max: number } {
  return { min: Math.min(0, ...points.map((p) => p.value)), max: Math.max(1, ...points.map((p) => p.value)) };
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Where a dragged Bézier handle lands: its time within 0–1 and its value within the graph, to two decimals. */
export function clampHandle(x: number, y: number): { readonly x: number; readonly y: number } {
  return { x: Math.min(1, Math.max(0, round2(x))), y: Math.min(GRAPH_MAX, Math.max(GRAPH_MIN, round2(y))) };
}
