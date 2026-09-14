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
import { effectiveMode, exportMode, extensionChain, importTokens, resolveVariable, wouldCreateAliasCycle, type CollectionData, type VariableData, type VariableLookup } from './resolve';

const theme: CollectionData = { id: 'theme', name: 'Theme', modes: [{ modeId: 'light', name: 'Light' }, { modeId: 'dark', name: 'Dark' }] };
const primitives: CollectionData = { id: 'primitives', name: 'Primitives', modes: [{ modeId: 'base', name: 'Value' }] };
const white = { r: 1, g: 1, b: 1, a: 1 };
const navy = { r: 0, g: 0, b: 0.5, a: 1 };

const variables: VariableData[] = [
  { id: 'white', name: 'color/white', collectionId: 'primitives', type: 'COLOR', valuesByMode: { base: white } },
  { id: 'navy', name: 'color/navy', collectionId: 'primitives', type: 'COLOR', valuesByMode: { base: navy } },
  { id: 'surface', name: 'surface', collectionId: 'theme', type: 'COLOR', valuesByMode: { light: { type: 'VARIABLE_ALIAS', id: 'white' }, dark: { type: 'VARIABLE_ALIAS', id: 'navy' } } },
  { id: 'card', name: 'surface/card', collectionId: 'theme', type: 'COLOR', valuesByMode: { light: { type: 'VARIABLE_ALIAS', id: 'surface' }, dark: { type: 'VARIABLE_ALIAS', id: 'surface' } } },
  { id: 'gap', name: 'space/gap', collectionId: 'theme', type: 'FLOAT', valuesByMode: { light: 8, dark: 12 } },
  { id: 'visible', name: 'flags/visible', collectionId: 'theme', type: 'BOOLEAN', valuesByMode: { light: true, dark: false } },
  { id: 'loopA', name: 'loop/a', collectionId: 'theme', type: 'FLOAT', valuesByMode: { light: { type: 'VARIABLE_ALIAS', id: 'loopB' } } },
  { id: 'loopB', name: 'loop/b', collectionId: 'theme', type: 'FLOAT', valuesByMode: { light: { type: 'VARIABLE_ALIAS', id: 'loopA' } } },
  { id: 'wrongType', name: 'wrong', collectionId: 'theme', type: 'FLOAT', valuesByMode: { light: { type: 'VARIABLE_ALIAS', id: 'white' } } },
];

const lookup: VariableLookup = {
  variable: (id) => variables.find((v) => v.id === id),
  collection: (id) => [theme, primitives].find((c) => c.id === id),
};

describe('variables', () => {
  test('values resolve through aliases, in the mode of each collection', () => {
    expect(resolveVariable(lookup, 'card')).toEqual(white);
    expect(resolveVariable(lookup, 'card', (c) => (c.id === 'theme' ? 'dark' : undefined))).toEqual(navy);
    expect(resolveVariable(lookup, 'gap', () => 'dark')).toBe(12);
    // A mode that doesn't exist falls back to the default mode's value.
    expect(resolveVariable(lookup, 'gap', () => 'missing')).toBe(8);
    expect(resolveVariable(lookup, 'loopA')).toBeNull();
    expect(resolveVariable(lookup, 'wrongType')).toBeNull();
    expect(resolveVariable(lookup, 'nope')).toBeNull();
  });

  test('alias cycles are detected in any mode', () => {
    expect(wouldCreateAliasCycle(lookup, 'surface', 'card')).toBe(true);
    expect(wouldCreateAliasCycle(lookup, 'surface', 'surface')).toBe(true);
    expect(wouldCreateAliasCycle(lookup, 'card', 'white')).toBe(false);
  });

  test('Auto uses the nearest explicit mode up the layer hierarchy, then the default mode', () => {
    expect(effectiveMode(theme, [undefined, undefined])).toBe('light');
    expect(effectiveMode(theme, [undefined, { theme: 'dark' }, { theme: 'light' }])).toBe('dark');
    expect(effectiveMode(theme, [{ primitives: 'base' }, { theme: 'deleted' }])).toBe('light');
  });

  test('a mode exports as DTCG JSON and imports back', () => {
    const json = exportMode(lookup, variables, theme, 'dark');
    expect(json).toMatchObject({
      space: { gap: { $type: 'number', $value: 12 } },
      flags: { visible: { $type: 'number', $value: 0, $extensions: { 'com.openframe.type': 'boolean' } } },
      surface: { $type: 'color', $value: { colorSpace: 'srgb', components: [0, 0, 0.5], alpha: 1, hex: '#000080' } },
    });
    expect((json.surface as { $extensions: Record<string, unknown> }).$extensions['com.openframe.aliasData']).toMatchObject({ targetVariableID: 'navy', targetVariableSetName: 'Primitives' });

    const cardOnly = exportMode(lookup, variables.filter((v) => v.id !== 'surface'), theme, 'light');
    expect(cardOnly.surface).toMatchObject({ card: { $type: 'color' } });

    const imported = importTokens(json);
    expect(imported).toEqual(
      expect.arrayContaining([
        { name: 'space/gap', type: 'FLOAT', value: 12 },
        { name: 'flags/visible', type: 'BOOLEAN', value: false },
        { name: 'surface', type: 'COLOR', value: navy },
      ]),
    );
  });

  test('DTCG import: supported types, references, inherited types, hsl colors and duplicate names', () => {
    const tokens = importTokens({
      red: { $type: 'color', $value: { colorSpace: 'hsl', components: [0, 100, 50], alpha: 0.5 } },
      danger: { $type: 'color', $value: '{red}' },
      'border-radius-default': { $type: 'number', $value: 5 },
      'button-text': { $type: 'string', $value: 'Click here' },
      padding: { $type: 'dimension', $value: { value: 16, unit: 'px' } },
      em: { $type: 'dimension', $value: { value: 2, unit: 'rem' } },
      'heading-font': { $type: 'fontFamily', $value: 'Inter' },
      fonts: { $type: 'fontFamily', $value: ['Inter', 'Arial'] },
      'transition-duration': { $type: 'duration', $value: { value: 0.3, unit: 's' } },
      spacing: { $type: 'number', small: { $value: 4 }, 'x.large': { $value: 32 } },
      'spacing/small': { $type: 'number', $value: 99 },
      shadow: { $type: 'shadow', $value: {} },
    });
    expect(tokens).toEqual([
      { name: 'red', type: 'COLOR', value: { r: 1, g: 0, b: 0, a: 0.5 } },
      { name: 'danger', type: 'COLOR', aliasOf: 'red' },
      { name: 'border-radius-default', type: 'FLOAT', value: 5 },
      { name: 'button-text', type: 'STRING', value: 'Click here' },
      { name: 'padding', type: 'FLOAT', value: 16 },
      { name: 'heading-font', type: 'STRING', value: 'Inter' },
      { name: 'transition-duration', type: 'FLOAT', value: 0.3 },
      { name: 'spacing/small', type: 'FLOAT', value: 4 },
      { name: 'spacing/x/large', type: 'FLOAT', value: 32 },
    ]);
  });
});

describe('extended collections', () => {
  const brand: CollectionData = { id: 'brand', name: 'Brand', modes: [{ modeId: 'light', name: 'Light' }, { modeId: 'dark', name: 'Dark' }] };
  const acme: CollectionData = { ...brand, id: 'acme', name: 'Acme', extends: 'brand', overrides: { bg: { dark: { r: 1, g: 0, b: 0, a: 0.8 } } } };
  const night: CollectionData = { ...brand, id: 'night', name: 'Acme night', extends: 'acme', overrides: { bg: { light: { r: 0, g: 0, b: 0, a: 1 } } } };
  const brandVariables: VariableData[] = [{ id: 'bg', name: 'bg/brand', collectionId: 'brand', type: 'COLOR', valuesByMode: { light: white, dark: navy } }];
  const extended: VariableLookup = {
    variable: (id) => brandVariables.find((v) => v.id === id),
    collection: (id) => [brand, acme, night].find((c) => c.id === id),
  };

  test('values resolve with the nearest override, falling back to the parent collection', () => {
    expect(extensionChain(extended, night)).toEqual({ root: brand, extensions: [night, acme] });
    expect(extensionChain(extended, brand)).toEqual({ root: brand, extensions: [] });
    expect(resolveVariable(extended, 'bg', () => 'dark', () => [acme])).toEqual({ r: 1, g: 0, b: 0, a: 0.8 });
    expect(resolveVariable(extended, 'bg', () => 'light', () => [acme])).toEqual(white);
    expect(resolveVariable(extended, 'bg', () => 'dark', () => [night, acme])).toEqual({ r: 1, g: 0, b: 0, a: 0.8 });
    expect(resolveVariable(extended, 'bg', () => 'light', () => [night, acme])).toEqual({ r: 0, g: 0, b: 0, a: 1 });
    expect(resolveVariable(extended, 'bg', () => 'dark')).toEqual(navy);
  });

  test('an extended collection exports its parent variables with its overrides', () => {
    expect(exportMode(extended, brandVariables, acme, 'dark')).toMatchObject({ bg: { brand: { $type: 'color', $value: { components: [1, 0, 0], alpha: 0.8 } } } });
    expect(exportMode(extended, brandVariables, acme, 'light')).toMatchObject({ bg: { brand: { $value: { hex: '#FFFFFF' } } } });
  });
});
