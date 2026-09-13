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
import { makeText } from '../document/factory';
import type { TextNode } from '../schema/document';
import { linkAt, normalizeUrl, pastedUrl } from './links';
import { runsAfterEdit, styleRange } from './style-runs';

const link = { type: 'URL', value: 'https://example.com/' } as const;

describe('links', () => {
  test('addresses are normalized to http(s) and other schemes are rejected', () => {
    expect(normalizeUrl('example.com')).toBe('https://example.com/');
    expect(normalizeUrl(' www.example.com/file?x=1 ')).toBe('https://www.example.com/file?x=1');
    expect(normalizeUrl('http://localhost:5173/a')).toBe('http://localhost:5173/a');
    expect(normalizeUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeUrl('mailto:someone')).toBeNull();
    expect(normalizeUrl('hello world')).toBeNull();
    expect(normalizeUrl('hello')).toBeNull();
    expect(normalizeUrl('')).toBeNull();
    expect(normalizeUrl('HTTPS://Example.COM/Path')).toBe('https://example.com/Path');
    expect(normalizeUrl('https:example.com')).toBeNull();
    expect(normalizeUrl('http://[::1]:8080')).toBe('http://[::1]:8080/');
    // Only explicit addresses link on paste, not words that look like host names.
    expect(pastedUrl('https://example.com')).toBe('https://example.com/');
    expect(pastedUrl('www.example.com')).toBe('https://www.example.com/');
    expect(pastedUrl('notes.txt')).toBeNull();
  });

  test('the link at a caret or selection spans every character with that link', () => {
    const base: TextNode = { ...makeText({ id: 'x:1', parent: { id: 'x:0', key: 'V' }, name: 'T', x: 0, y: 0, width: 0, height: 0 }), characters: 'go to site now' };
    // "site" is linked, and its first two characters are also bold (two segments).
    const linked = { ...base, styleRuns: styleRange(base, 6, 10, { hyperlink: link }) };
    const node = { ...linked, styleRuns: styleRange(linked, 6, 8, { fontSize: 20 }) };
    expect(linkAt(node, 9, 9)).toEqual({ start: 6, end: 10, url: link.value });
    expect(linkAt(node, 6, 6)).toEqual({ start: 6, end: 10, url: link.value });
    expect(linkAt(node, 10, 10)).toEqual({ start: 6, end: 10, url: link.value });
    expect(linkAt(node, 11, 11)).toBeNull();
    expect(linkAt(node, 7, 9)).toEqual({ start: 6, end: 10, url: link.value });
    expect(linkAt(node, 5, 9)).toBeNull();
    // Typing at the end of a link doesn't extend it; typing inside it does.
    const after = { ...node, characters: 'go to site! now', styleRuns: runsAfterEdit(node, 10, 10, 1) };
    expect(linkAt(after, 10, 11)).toBeNull();
    expect(linkAt(after, 12, 12)).toBeNull();
    expect(linkAt(after, 9, 9)).toEqual({ start: 6, end: 10, url: link.value });
    const inside = { ...node, characters: 'go to siite now', styleRuns: runsAfterEdit(node, 8, 8, 1) };
    expect(linkAt(inside, 9, 9)).toEqual({ start: 6, end: 11, url: link.value });
  });
});
