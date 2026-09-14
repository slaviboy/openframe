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

import type { Vec2 } from '../math/vec';
import type { PrototypeTransition } from '../schema/document';

/** Past this share of the transition, letting go of a drag finishes it; before it, the transition goes back. */
export const DRAG_FINISH_AT = 0.5;

const DIRECTION_VECTORS = { LEFT: { x: -1, y: 0 }, RIGHT: { x: 1, y: 0 }, TOP: { x: 0, y: -1 }, BOTTOM: { x: 0, y: 1 } } as const;

/**
 * The way a drag moves through a transition: the way its moving frame travels, or for a transition without a direction
 * (Dissolve, Smart animate) the way the pointer first moved — along whichever axis it moved more.
 */
export function dragDirection(transition: PrototypeTransition, firstMove: Vec2): Vec2 {
  if ('direction' in transition) return DIRECTION_VECTORS[transition.direction];
  return Math.abs(firstMove.x) >= Math.abs(firstMove.y) ? { x: Math.sign(firstMove.x) || 1, y: 0 } : { x: 0, y: Math.sign(firstMove.y) || 1 };
}

/** How far through the transition a drag is (0–1): its distance along `direction`, as a share of the screen that way. */
export function dragProgress(direction: Vec2, delta: Vec2, screen: { readonly width: number; readonly height: number }): number {
  const length = direction.x !== 0 ? screen.width : screen.height;
  if (length <= 0) return 0;
  return Math.min(1, Math.max(0, (delta.x * direction.x + delta.y * direction.y) / length));
}
