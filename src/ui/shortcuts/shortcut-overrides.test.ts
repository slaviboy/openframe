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

import { beforeEach, describe, expect, test } from 'vitest';
import { Keymap, shortcutFromEvent } from '@/editor/keymap/keymap';
import { overridesMap, shortcutOverrides } from './shortcut-overrides';

beforeEach(() => {
  shortcutOverrides.clear();
});

const press = (over: Partial<{ code: string; key: string; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) => ({
  code: 'KeyD',
  key: 'd',
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...over,
});

describe('the shortcut a key press spells', () => {
  test('modifiers come first, in the order shortcuts are written', () => {
    expect(shortcutFromEvent(press({ metaKey: true, shiftKey: true }), true)).toBe('Mod+Shift+D');
    expect(shortcutFromEvent(press({ ctrlKey: true, altKey: true }), false)).toBe('Mod+Alt+D');
    // On a Mac, Control is its own modifier beside Command.
    expect(shortcutFromEvent(press({ metaKey: true, ctrlKey: true }), true)).toBe('Mod+Ctrl+D');
  });

  test('a modifier on its own spells no shortcut', () => {
    expect(shortcutFromEvent(press({ code: 'ShiftLeft', key: 'Shift', shiftKey: true }), true)).toBeNull();
  });
});

describe('the shortcuts a designer sets for themselves', () => {
  test('one replaces the command’s own, and clearing it gives that back', () => {
    shortcutOverrides.set('edit.delete', 'Mod+Shift+K');
    expect(shortcutOverrides.getSnapshot().overrides['edit.delete']).toEqual(['Mod+Shift+K']);
    shortcutOverrides.set('edit.delete', null);
    expect(shortcutOverrides.getSnapshot().overrides['edit.delete']).toBeUndefined();
  });

  test('the keymap resolves the new shortcut and no longer the old one', () => {
    const keymap = new Keymap(true);
    const defaults = new Map([['edit.delete', ['Delete']]]);
    keymap.setBindings(defaults, overridesMap({ 'edit.delete': ['Mod+Shift+K'] }));
    expect(keymap.resolve(press({ code: 'KeyK', key: 'k', metaKey: true, shiftKey: true }))).toBe('edit.delete');
    expect(keymap.resolve(press({ code: 'Delete', key: 'Delete' }))).toBeNull();
  });

  test('a command with no override keeps the shortcut it came with', () => {
    const keymap = new Keymap(true);
    keymap.setBindings(new Map([['edit.delete', ['Delete']]]), overridesMap({ 'edit.undo': ['Mod+Z'] }));
    expect(keymap.resolve(press({ code: 'Delete', key: 'Delete' }))).toBe('edit.delete');
  });

  test('Reset all gives every command its own back', () => {
    shortcutOverrides.set('edit.delete', 'Mod+K');
    shortcutOverrides.set('edit.undo', 'Mod+J');
    shortcutOverrides.clear();
    expect(Object.keys(shortcutOverrides.getSnapshot().overrides)).toEqual([]);
  });
});
