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

import type { Rect } from '@/core/math/rect';
import type { Vec2 } from '@/core/math/vec';

/**
 * Viewport maps world (document) coordinates to screen (CSS pixel) coordinates:
 *   screen = (world - origin) * zoom
 * `origin` is the world point at the top-left corner of the canvas element.
 */
export interface Viewport {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

export const MIN_ZOOM = 0.02;
export const MAX_ZOOM = 256;
export const DEFAULT_VIEWPORT: Viewport = { x: -100, y: -100, zoom: 1 };

/** Discrete zoom steps used by zoom in/out commands (⌘+ / ⌘−). */
export const ZOOM_STEPS = [0.02, 0.03, 0.05, 0.1, 0.25, 0.5, 1, 2, 4, 8, 16, 32, 64, 128, 256];

export const clampZoom = (z: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

export const screenToWorld = (v: Viewport, p: Vec2): Vec2 => ({ x: p.x / v.zoom + v.x, y: p.y / v.zoom + v.y });
export const worldToScreen = (v: Viewport, p: Vec2): Vec2 => ({ x: (p.x - v.x) * v.zoom, y: (p.y - v.y) * v.zoom });

/** Visible world rectangle for a canvas of the given CSS size. */
export const visibleWorldRect = (v: Viewport, width: number, height: number): Rect => ({
  x: v.x,
  y: v.y,
  width: width / v.zoom,
  height: height / v.zoom,
});

/** Zooms to `zoom` keeping the world point under `screenPoint` fixed. */
export function zoomAt(v: Viewport, screenPoint: Vec2, zoom: number): Viewport {
  const z = clampZoom(zoom);
  const world = screenToWorld(v, screenPoint);
  return { zoom: z, x: world.x - screenPoint.x / z, y: world.y - screenPoint.y / z };
}

export const panBy = (v: Viewport, dxScreen: number, dyScreen: number): Viewport => ({
  zoom: v.zoom,
  x: v.x - dxScreen / v.zoom,
  y: v.y - dyScreen / v.zoom,
});

export function nextZoomStep(zoom: number, direction: 1 | -1): number {
  if (direction > 0) return ZOOM_STEPS.find((s) => s > zoom * 1.001) ?? MAX_ZOOM;
  return [...ZOOM_STEPS].reverse().find((s) => s < zoom / 1.001) ?? MIN_ZOOM;
}

/**
 * Fits `target` into the canvas with padding. `maxZoom` caps zoom-to-fit so small
 * objects are not magnified beyond 100% by "zoom to fit", but "zoom to selection" may.
 */
export function fitRect(target: Rect, canvasWidth: number, canvasHeight: number, padding = 64, maxZoom = MAX_ZOOM): Viewport {
  const availW = Math.max(1, canvasWidth - padding * 2);
  const availH = Math.max(1, canvasHeight - padding * 2);
  const zoom = clampZoom(Math.min(availW / Math.max(target.width, 1e-6), availH / Math.max(target.height, 1e-6), maxZoom));
  return {
    zoom,
    x: target.x + target.width / 2 - canvasWidth / 2 / zoom,
    y: target.y + target.height / 2 - canvasHeight / 2 / zoom,
  };
}
