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

import { describe, expect, test } from 'vitest';
import { formatShortcut, Keymap, matches, parseChord, type KeyEventLike } from './keymap';

const event = (over: Partial<KeyEventLike>): KeyEventLike => ({
  key: '',
  code: '',
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...over,
});

describe('keymap', () => {
  test('Backspace and Delete spell the same key, matching a pressed Backspace', () => {
    const backspace = event({ key: 'Backspace', code: 'Backspace', metaKey: true });
    expect(parseChord('Mod+Backspace')).toEqual(parseChord('Mod+Delete'));
    expect(matches(parseChord('Mod+Delete'), backspace, true)).toBe(true);
    expect(matches(parseChord('Delete'), backspace, true)).toBe(false);
    expect(formatShortcut('Mod+Delete', true)).toBe('⌘⌫');
  });

  test('letters match physical codes with exact modifiers', () => {
    const shiftS = event({ key: 'S', code: 'KeyS', shiftKey: true });
    expect(matches(parseChord('Shift+S'), shiftS, true)).toBe(true);
    expect(matches(parseChord('S'), shiftS, true)).toBe(false);
    // Option changes `key` on macOS; the code still identifies the letter.
    expect(matches(parseChord('Mod+Alt+S'), event({ key: 'ß', code: 'KeyS', metaKey: true, altKey: true }), true)).toBe(true);
  });

  test('resolve picks the binding whose modifiers match, regardless of registration order', () => {
    const keymap = new Keymap(true);
    keymap.setBindings(
      new Map([
        ['tools.section', ['Shift+S']],
        ['tools.slice', ['S']],
      ]),
    );
    expect(keymap.resolve(event({ key: 's', code: 'KeyS' }))).toBe('tools.slice');
    expect(keymap.resolve(event({ key: 'S', code: 'KeyS', shiftKey: true }))).toBe('tools.section');
    expect(keymap.conflicts().size).toBe(0);
  });

  test('resolveAll lists every command bound to a chord in binding order', () => {
    const keymap = new Keymap(true);
    keymap.setBindings(
      new Map([
        ['hierarchy.selectChildren', ['Enter']],
        ['tools.placeObject', ['Enter']],
        ['view.focusToolbar', ['F6', 'Ctrl+F6']],
      ]),
    );
    expect(keymap.resolveAll(event({ key: 'Enter', code: 'Enter' }))).toEqual(['hierarchy.selectChildren', 'tools.placeObject']);
    expect(keymap.resolveAll(event({ key: 'F6', code: 'F6' }))).toEqual(['view.focusToolbar']);
    expect(keymap.resolveAll(event({ key: 'F6', code: 'F6', ctrlKey: true }))).toEqual(['view.focusToolbar']);
    expect(keymap.conflicts().size).toBe(1);
  });

  test('user overrides replace defaults', () => {
    const keymap = new Keymap(false);
    keymap.setBindings(new Map([['edit.undo', ['Mod+Z']]]), new Map([['edit.undo', ['Ctrl+U']]]));
    expect(keymap.resolve(event({ key: 'z', code: 'KeyZ', ctrlKey: true }))).toBeNull();
    expect(keymap.resolve(event({ key: 'u', code: 'KeyU', ctrlKey: true }))).toBe('edit.undo');
  });
});
