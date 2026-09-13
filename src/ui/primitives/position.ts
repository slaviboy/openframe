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

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface Box extends Size {
  readonly x: number;
  readonly y: number;
}

/**
 * - `bottom-start` / `top-start`: below or above the anchor, left-aligned (dropdowns).
 * - `right-start`: to the right of the anchor, top-aligned (submenus).
 * - `point`: at the anchor's top-left, e.g. a context menu at the pointer.
 */
export type Placement = 'bottom-start' | 'top-start' | 'right-start' | 'point';

/**
 * Positions a floating element (menu, popover) relative to an anchor. It prefers the
 * requested side, flips to the opposite side when that fits better, and finally clamps the
 * element into the viewport with a margin, so it never renders off-screen.
 */
export function placeFloating(anchor: Box, size: Size, viewport: Size, placement: Placement, margin = 8, gap = 4): { x: number; y: number } {
  let x: number;
  let y: number;
  const fitsBelow = (top: number) => top + size.height <= viewport.height - margin;
  const fitsAbove = (bottom: number) => bottom - size.height >= margin;
  const fitsRight = (left: number) => left + size.width <= viewport.width - margin;

  switch (placement) {
    case 'bottom-start': {
      x = anchor.x;
      const below = anchor.y + anchor.height + gap;
      const aboveBottom = anchor.y - gap;
      y = fitsBelow(below) || !fitsAbove(aboveBottom) ? below : aboveBottom - size.height;
      break;
    }
    case 'top-start': {
      x = anchor.x;
      const aboveBottom = anchor.y - gap;
      const below = anchor.y + anchor.height + gap;
      y = fitsAbove(aboveBottom) || !fitsBelow(below) ? aboveBottom - size.height : below;
      break;
    }
    case 'right-start': {
      const right = anchor.x + anchor.width + gap;
      x = fitsRight(right) ? right : anchor.x - gap - size.width;
      y = anchor.y;
      break;
    }
    case 'point': {
      x = fitsRight(anchor.x) ? anchor.x : anchor.x - size.width;
      y = fitsBelow(anchor.y) ? anchor.y : anchor.y - size.height;
      break;
    }
  }

  const clamp = (value: number, extent: number, limit: number) => Math.max(margin, Math.min(value, limit - margin - extent));
  return {
    x: size.width > viewport.width - margin * 2 ? margin : clamp(x, size.width, viewport.width),
    y: size.height > viewport.height - margin * 2 ? margin : clamp(y, size.height, viewport.height),
  };
}
