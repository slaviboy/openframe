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
import { createEmptyDocument, keyOnTop, makeFrame, makeRectangle, solid } from '../document/factory';
import { DocumentStore } from '../document/store';
import { History } from '../history/history';
import { IdGenerator } from '../ids/ids';
import type { SceneNode, SolidPaint } from '../schema/document';
import { blendVariantStore } from './variant-animate';

/** The prototype's copy before the switch (the instance showing the variant left) and after it. */
let before: DocumentStore;
let after: DocumentStore;

const red = { r: 1, g: 0, b: 0, a: 1 };
const blue = { r: 0, g: 0, b: 1, a: 1 };

/**
 * An instance with one child, as the runtime builds it: switching a variant gives the instance's layers new ids, so the
 * two copies share only the instance's own id.
 */
function build(childId: string, x: number, color: typeof red, extra: { readonly label?: string; readonly badge?: string }): DocumentStore {
  const ids = new IdGenerator('v');
  const store = createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids });
  const page = store.pages()[0]!;
  const history = new History({ store, captureMeta: () => null, restoreMeta: () => undefined });
  const shape = (id: string, parent: string, name: string, left: number, width = 100) => ({ id, parent: { id: parent, key: keyOnTop(store, parent) }, name, x: left, y: 0, width, height: 50 });
  history.run('Build', (tx) => {
    tx.create(makeFrame(shape('screen', page, 'Screen', 0, 400)));
    tx.create(makeFrame(shape('instance', 'screen', 'Button', 0, 200)));
    tx.create({ ...makeRectangle(shape(childId, 'instance', 'Background', x)), fills: [solid(color)] });
    if (extra.label !== undefined) tx.create(makeRectangle(shape(extra.label, childId, 'Label', 10, 40)));
    if (extra.badge !== undefined) tx.create(makeRectangle(shape(extra.badge, 'instance', 'Badge', 150, 20)));
  });
  return store;
}

beforeEach(() => {
  before = build('old-bg', 0, red, { label: 'old-label', badge: 'old-badge' });
  after = build('new-bg', 40, blue, { label: 'new-label' });
});

const node = (s: DocumentStore, id: string) => s.getOrThrow(id) as SceneNode;
const fill = (n: SceneNode) => ((n as SceneNode & { fills: SolidPaint[] }).fills[0]!).color;

describe('a Change to in flight', () => {
  test('halfway with smart animate: matching layers move and their colors blend', () => {
    const mid = blendVariantStore(before, after, 'instance', 0.5, true);
    const background = node(mid, 'new-bg');
    expect(background.transform[4]).toBe(20);
    expect(fill(background)).toEqual({ r: 0.5, g: 0, b: 0.5, a: 1 });
    // Layers are matched by their path of names, through the layer that replaced their parent.
    expect(node(mid, 'new-label').opacity).toBe(1);
  });

  test('halfway with a dissolve: colors blend where the layers stay put', () => {
    const mid = blendVariantStore(before, after, 'instance', 0.5, false);
    const background = node(mid, 'new-bg');
    expect(background.transform[4]).toBe(40);
    expect(fill(background)).toEqual({ r: 0.5, g: 0, b: 0.5, a: 1 });
  });

  test('a layer only the variant left had fades out where it was, and is gone at the end', () => {
    const mid = blendVariantStore(before, after, 'instance', 0.25, true);
    expect(node(mid, 'old-badge').opacity).toBe(0.75);
    expect(node(mid, 'old-badge').parent.id).toBe('instance');

    const end = blendVariantStore(before, after, 'instance', 1, true);
    expect(node(end, 'old-badge').opacity).toBe(0);
    expect(node(end, 'new-bg').transform[4]).toBe(40);
    expect(fill(node(end, 'new-bg'))).toEqual(blue);
  });

  test('a layer the new variant adds fades in', () => {
    const withExtra = build('new-bg', 40, blue, { label: 'new-label', badge: 'new-badge' });
    const mid = blendVariantStore(before, withExtra, 'instance', 0.25, true);
    // Badge matches by name, so it blends rather than fading in.
    expect(node(mid, 'new-badge').opacity).toBe(1);

    const added = build('new-bg', 40, blue, { label: 'new-label' });
    const start = blendVariantStore(added, before, 'instance', 0.25, true);
    expect(node(start, 'old-badge').opacity).toBe(0.25);
  });

  test('everything outside the instance is the destination’s, and the start is the variant left', () => {
    const start = blendVariantStore(before, after, 'instance', 0, true);
    expect(node(start, 'new-bg').transform[4]).toBe(0);
    expect(fill(node(start, 'new-bg'))).toEqual(red);
    expect(node(start, 'old-badge').opacity).toBe(1);
    expect(node(start, 'screen').size).toEqual({ width: 400, height: 50 });
  });
});
