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
import { createEmptyDocument, keyOnTop, makeFrame, makeRectangle, makeText, solid } from '@/core/document/factory';
import { IdGenerator } from '@/core/ids/ids';
import type { FrameNode, RectangleNode, SceneNode, TextNode } from '@/core/schema/document';
import { generateCode } from './code-gen';

const ids = new IdGenerator('g');
const store = createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids });
const page = store.pages()[0]!;
const parent = { id: page, key: keyOnTop(store, page) };

/** A red 120×80 rectangle with an 8px corner radius, half faded. */
const rect: RectangleNode = {
  ...makeRectangle({ id: 'r1', parent, name: 'Card', x: 0, y: 0, width: 120, height: 80 }),
  fills: [solid({ r: 1, g: 0, b: 0, a: 1 })],
  cornerRadius: 8,
  opacity: 0.5,
};

/** A row that lays its children out with a gap and padding. */
const frame: FrameNode = {
  ...makeFrame({ id: 'f1', parent, name: 'Row', x: 0, y: 0, width: 200, height: 100 }),
  layoutMode: 'HORIZONTAL',
  itemSpacing: 8,
  paddingTop: 12,
  paddingRight: 16,
  paddingBottom: 12,
  paddingLeft: 16,
};

const text = {
  ...makeText({ id: 't1', parent, name: 'Label', x: 0, y: 0, width: 80, height: 32 }),
  characters: 'Hello',
  fontName: { family: 'Inter', style: 'Semi Bold' },
  fontSize: 24,
  lineHeight: { unit: 'PIXELS', value: 32 },
  fills: [solid({ r: 0, g: 0, b: 0, a: 1 })],
} as TextNode;

const css = (node: SceneNode, unit: 'px' | 'rem' = 'px', scale?: number) => generateCode(node, { language: 'CSS', unit, ...(scale === undefined ? {} : { scale }) });

describe('the code a selection is written out as', () => {
  test('CSS gives the box, its fill, its radius and what it fades to', () => {
    const out = css(rect);
    expect(out).toContain('width: 120px;');
    expect(out).toContain('height: 80px;');
    expect(out).toContain('border-radius: 8px;');
    expect(out).toContain('background: #FF0000;');
    expect(out).toContain('opacity: 0.5;');
  });

  test('an auto-layout frame writes out as a flex row with its gap and padding', () => {
    const out = css(frame);
    expect(out).toContain('display: flex;');
    expect(out).toContain('flex-direction: row;');
    expect(out).toContain('gap: 8px;');
    expect(out).toContain('padding: 12px 16px 12px 16px;');
  });

  test('rems divide by the root font size, and a unit scale of its own overrides it', () => {
    expect(css(rect, 'rem')).toContain('width: 7.5rem;');
    expect(css(rect, 'rem', 10)).toContain('width: 12rem;');
  });

  test('text carries its typography, with the weight read from the style name', () => {
    const out = css(text);
    expect(out).toContain('font-family: "Inter";');
    expect(out).toContain('font-size: 24px;');
    expect(out).toContain('font-weight: 600;');
    expect(out).toContain('line-height: 32px;');
    expect(out).toContain('color: #000000;');
    // Text is coloured, not filled with a background.
    expect(out).not.toContain('background:');
  });

  test('SwiftUI frames the layer and fills it in parts of one', () => {
    const out = generateCode(rect, { language: 'SWIFTUI', unit: 'pt' });
    expect(out).toContain('.frame(width: 120, height: 80)');
    expect(out).toContain('.fill(Color(red: 1, green: 0, blue: 0))');
    expect(out).toContain('.cornerRadius(8)');
  });

  test('UIKit builds a view, and points scale by the factor given', () => {
    const out = generateCode(rect, { language: 'UIKIT', unit: 'pt', scale: 2 });
    expect(out).toContain('CGRect(x: 0, y: 0, width: 60, height: 40)');
    expect(out).toContain('view.layer.cornerRadius = 4');
  });

  test('Compose writes a modifier chain in dp, with the colour as a hex literal', () => {
    const out = generateCode(rect, { language: 'COMPOSE', unit: 'dp' });
    expect(out).toContain('.size(width = 120.dp, height = 80.dp)');
    expect(out).toContain('.background(Color(0xFFFF0000), shape = RoundedCornerShape(8.dp))');
    expect(out).toContain('.alpha(0.5f)');
  });

  test('Android XML writes a view, and a text layer becomes a TextView', () => {
    expect(generateCode(rect, { language: 'ANDROID_XML', unit: 'dp' })).toContain('android:layout_width="120dp"');
    const label = generateCode(text, { language: 'ANDROID_XML', unit: 'dp' });
    expect(label).toContain('<TextView');
    expect(label).toContain('android:text="Hello"');
    expect(label).toContain('android:textSize="24sp"');
  });
});
