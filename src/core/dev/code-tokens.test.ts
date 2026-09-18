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
import type { CodeLanguage } from '@/core/dev/code-gen';
import { tokenizeLine } from '@/core/dev/code-tokens';

/** What the line reads as once the spans are put back together — a chit adds nothing, so this is the line. */
const rejoin = (line: string, language: CodeLanguage) =>
  tokenizeLine(line, language)
    .map((token) => token.text)
    .join('');

const kinds = (line: string, language: CodeLanguage) => tokenizeLine(line, language).map((token) => `${token.kind}:${token.text}`);

describe('tokenizeLine', () => {
  test('CSS splits a declaration into property, punctuation and value', () => {
    expect(kinds('align-self: stretch;', 'CSS')).toEqual(['property:align-self', 'punctuation::', 'plain: stretch', 'punctuation:;']);
  });

  test('CSS separates a measurement from its unit', () => {
    expect(kinds('width: 375px;', 'CSS')).toEqual(['property:width', 'punctuation::', 'plain: ', 'number:375', 'unit:px', 'punctuation:;']);
  });

  test('CSS gives a colour a swatch that carries no text', () => {
    const tokens = tokenizeLine('background: #FFFFFF;', 'CSS');
    const chit = tokens.find((token) => token.kind === 'chit');
    expect(chit).toEqual({ kind: 'chit', text: '', swatch: '#FFFFFF' });
  });

  test('CSS reads a quoted family as a string', () => {
    expect(kinds('font-family: "Inter";', 'CSS')).toContain('string:"Inter"');
  });

  test('Compose reads calls, numbers and the dot between them', () => {
    expect(kinds('    .size(width = 100.dp)', 'COMPOSE')).toEqual([
      'plain:    ',
      'operator:.',
      'function:size',
      'punctuation:(',
      'plain:width ',
      'operator:=',
      'plain: ',
      'number:100',
      'operator:.',
      'plain:dp',
      'punctuation:)',
    ]);
  });

  test('Compose colours get a swatch from the last six digits of the literal', () => {
    const tokens = tokenizeLine('    .background(Color(0xFF0D99FF))', 'COMPOSE');
    expect(tokens.find((token) => token.kind === 'chit')).toEqual({ kind: 'chit', text: '', swatch: '#0D99FF' });
    expect(tokens.find((token) => token.kind === 'number')).toEqual({ kind: 'number', text: '0xFF0D99FF' });
  });

  test('a C-like comment runs to the end of the line', () => {
    expect(kinds('    // Child views.', 'COMPOSE')).toEqual(['plain:    ', 'comment:// Child views.']);
  });

  test('a Swift string keeps its escaped quotes', () => {
    expect(kinds('Text("a \\" b")', 'SWIFTUI')).toEqual(['function:Text', 'punctuation:(', 'string:"a \\" b"', 'punctuation:)']);
  });

  test('XML names the tag, its attributes and their values apart', () => {
    expect(kinds('    android:layout_width="375dp"', 'ANDROID_XML')).toEqual(['plain:    ', 'attribute:android:layout_width', 'operator:=', 'string:"375dp"']);
    expect(kinds('<TextView', 'ANDROID_XML')).toEqual(['punctuation:<', 'tag:TextView']);
    expect(kinds('    />', 'ANDROID_XML')).toEqual(['plain:    ', 'punctuation:/>']);
  });

  test('every language puts the line back together unchanged', () => {
    const cases: readonly (readonly [string, CodeLanguage])[] = [
      ['width: 375px;', 'CSS'],
      ['border: 1px solid #000000;', 'CSS'],
      ['padding: 8px 16px 8px 16px;', 'CSS'],
      ['let view = UIView(frame: CGRect(x: 0, y: 0, width: 24, height: 24))', 'UIKIT'],
      ['    .background(Color(0xFFFFFFFF), shape = RoundedCornerShape(8.dp))', 'COMPOSE'],
      ['Column(', 'COMPOSE'],
      ['    android:textColor="#000000"', 'ANDROID_XML'],
      ['', 'CSS'],
    ];
    for (const [line, language] of cases) expect(rejoin(line, language)).toBe(line);
  });
});
