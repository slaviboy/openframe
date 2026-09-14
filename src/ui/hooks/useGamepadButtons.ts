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

import { useEffect, useRef } from 'react';
import { newlyPressed } from '@/core/prototype/gamepad';

/** How often connected gamepads are read: the Gamepad API has no button events. */
const POLL_MS = 50;

/** While `enabled`, calls `onPress` with a button's index whenever a button of a connected gamepad is pressed. */
export function useGamepadButtons(enabled: boolean, onPress: (button: number) => void): void {
  const handler = useRef(onPress);
  useEffect(() => {
    handler.current = onPress;
  });
  useEffect(() => {
    if (!enabled || typeof navigator.getGamepads !== 'function') return;
    const previous = new Map<number, boolean[]>();
    let timer = 0;
    const poll = () => {
      for (const pad of navigator.getGamepads()) {
        if (!pad) continue;
        const current = pad.buttons.map((button) => button.pressed);
        const before = previous.get(pad.index);
        previous.set(pad.index, current);
        // The first look at a gamepad only learns which of its buttons are already down.
        if (before) for (const button of newlyPressed(before, current)) handler.current(button);
      }
    };
    const start = () => {
      if (timer) return;
      poll();
      timer = window.setInterval(poll, POLL_MS);
    };
    // Browsers list a gamepad once it has been used on the page; until then they fire gamepadconnected.
    if (navigator.getGamepads().some((pad) => pad !== null)) start();
    window.addEventListener('gamepadconnected', start);
    return () => {
      window.removeEventListener('gamepadconnected', start);
      window.clearInterval(timer);
    };
  }, [enabled]);
}
