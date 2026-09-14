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

/**
 * Gamepad buttons in Key/Gamepad triggers: a button of a controller with the standard layout (Xbox One, PlayStation 4
 * and Nintendo Switch Pro controllers) is stored as `Gamepad` and its index, among the keyboard codes.
 */

/** Button names by index in the standard layout, Xbox first (a Switch Pro controller's face buttons are swapped). */
export const GAMEPAD_BUTTON_LABELS: readonly string[] = [
  'A / ✕',
  'B / ○',
  'X / □',
  'Y / △',
  'LB / L1',
  'RB / R1',
  'LT / L2',
  'RT / R2',
  'View / Share',
  'Menu / Options',
  'Left stick',
  'Right stick',
  'D-pad up',
  'D-pad down',
  'D-pad left',
  'D-pad right',
  'Home',
];

const GAMEPAD_CODE = /^Gamepad(\d{1,2})$/;

export const gamepadCode = (button: number): string => `Gamepad${button}`;

/** The button index of a gamepad code; null for keyboard codes. */
export function gamepadButtonOf(code: string): number | null {
  const match = GAMEPAD_CODE.exec(code);
  return match ? Number(match[1]) : null;
}

/** How a gamepad code shows (e.g. "Gamepad A / ✕"); null for keyboard codes. */
export function gamepadLabel(code: string): string | null {
  const button = gamepadButtonOf(code);
  return button === null ? null : `Gamepad ${GAMEPAD_BUTTON_LABELS[button] ?? `button ${button + 1}`}`;
}

/** The buttons down now that weren't at the last look, by index. */
export function newlyPressed(previous: readonly boolean[], current: readonly boolean[]): number[] {
  return current.flatMap((pressed, button) => (pressed && !previous[button] ? [button] : []));
}
