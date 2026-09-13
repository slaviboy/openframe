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

/** Presses closer together than this (in ms and CSS px) continue a multi-click. */
export const MULTI_CLICK_MS = 500;
export const MULTI_CLICK_DISTANCE_PX = 4;

/**
 * Counts consecutive presses (1 = single, 2 = double, …) from pointer-down samples.
 * `PointerEvent.detail` cannot be used: Chromium and Firefox report 0 for pointer events,
 * and only WebKit fills in the click count.
 */
export class ClickCounter {
  private last: { x: number; y: number; time: number; button: number; count: number } | null = null;

  /** Registers a press and returns its click count. */
  press(x: number, y: number, time: number, button: number): number {
    const prev = this.last;
    const continues =
      prev !== null &&
      prev.button === button &&
      time - prev.time <= MULTI_CLICK_MS &&
      Math.hypot(x - prev.x, y - prev.y) <= MULTI_CLICK_DISTANCE_PX;
    const count = continues ? prev.count + 1 : 1;
    this.last = { x, y, time, button, count };
    return count;
  }

  /** Click count of the most recent press (used for the matching release). */
  get current(): number {
    return this.last?.count ?? 1;
  }
}
