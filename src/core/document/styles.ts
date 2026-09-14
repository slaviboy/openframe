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

import type { Transaction } from '../history/history';
import { ROOT_ID, type Id } from '../ids/ids';
import { hasGeometry, isSceneNode, type Node, type SceneNode, type StyleNode } from '../schema/document';
import type { DocumentStore } from './store';

export type StyleType = StyleNode['styleType'];

/** Typography a text style holds (alignment stays with each text layer). */
export const TEXT_STYLE_FIELDS = [
  'fontName',
  'fontSize',
  'lineHeight',
  'letterSpacing',
  'paragraphSpacing',
  'paragraphIndent',
  'listSpacing',
  'textCase',
  'textDecoration',
  'openTypeFeatures',
  'fontVariations',
  'leadingTrim',
  'hangingPunctuation',
] as const;

/** Where a style applies on a layer. */
export type StyleSlot = 'fill' | 'stroke' | 'text' | 'effect' | 'grid';

/** The layer field that links a layer to the style of a slot. */
export type StyleReference = 'fillStyleId' | 'strokeStyleId' | 'textStyleId' | 'effectStyleId' | 'gridStyleId';

interface SlotInfo {
  readonly styleType: StyleType;
  readonly reference: StyleReference;
  /** Pairs of the layer field and the style field it takes its value from. */
  readonly fields: ReadonlyArray<readonly [layer: string, style: string]>;
}

export const STYLE_SLOTS: Readonly<Record<StyleSlot, SlotInfo>> = {
  fill: { styleType: 'FILL', reference: 'fillStyleId', fields: [['fills', 'paints']] },
  stroke: { styleType: 'FILL', reference: 'strokeStyleId', fields: [['strokes', 'paints']] },
  text: { styleType: 'TEXT', reference: 'textStyleId', fields: TEXT_STYLE_FIELDS.map((name) => [name, name] as const) },
  effect: { styleType: 'EFFECT', reference: 'effectStyleId', fields: [['effects', 'effects']] },
  grid: { styleType: 'GRID', reference: 'gridStyleId', fields: [['layoutGuides', 'layoutGuides']] },
};

export const SLOTS = Object.keys(STYLE_SLOTS) as StyleSlot[];

/** Layer fields every layer of its kind has, which a style never removes. */
const REQUIRED_FIELDS: ReadonlySet<string> = new Set(['fills', 'strokes', 'fontName', 'fontSize', 'lineHeight', 'letterSpacing']);

const field = (node: object, name: string): unknown => (node as Record<string, unknown>)[name];
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
/** Document values are plain JSON data, so a JSON round trip copies them. */
const copyOf = (value: unknown): unknown => (value === undefined ? undefined : (JSON.parse(JSON.stringify(value)) as unknown));

export const isStyle = (node: Node | undefined): node is StyleNode => node?.type === 'STYLE';

/** Whether a layer can take a style in a slot: color styles on layers with fills and strokes, text styles on text, layout guide styles on frames. */
export function acceptsStyle(node: SceneNode, slot: StyleSlot): boolean {
  switch (slot) {
    case 'fill':
    case 'stroke':
      return hasGeometry(node);
    case 'text':
      return node.type === 'TEXT';
    case 'effect':
      return node.type !== 'SLICE';
    case 'grid':
      return node.type === 'FRAME';
  }
}

/** The local styles of a document in their order, optionally of one type. */
export function localStyles(store: DocumentStore, type?: StyleType): StyleNode[] {
  return store
    .children(ROOT_ID)
    .map((id) => store.get(id))
    .filter((node): node is StyleNode => isStyle(node) && (type === undefined || node.styleType === type));
}

/** The layer fields a style gives a layer in a slot. */
export function styleValuesForLayer(style: StyleNode, slot: StyleSlot): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const [layer, styleField] of STYLE_SLOTS[slot].fields) {
    const value = copyOf(field(style, styleField));
    if (value !== undefined || !REQUIRED_FIELDS.has(layer)) values[layer] = value;
  }
  return values;
}

/** The style fields a layer's values give a new style for a slot. */
export function styleValuesFromLayer(node: SceneNode, slot: StyleSlot): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const [layer, styleField] of STYLE_SLOTS[slot].fields) {
    const value = copyOf(field(node, layer));
    if (value !== undefined) values[styleField] = value;
  }
  return values;
}

/** Per transaction, the `id\0field` values the style finalizer set itself, so later runs (previews, the commit) don't take them for edits. */
const styledValues = new WeakMap<Transaction, Set<string>>();

/**
 * Keeps layers in step with their styles (history finalizer, registered before the component finalizer):
 * - a change to a style reaches every layer it is applied to (instance layers follow their main component instead,
 *   unless they applied the style themselves);
 * - changing a styled property on a layer directly detaches the style, and the layer keeps the new value;
 * - deleting a style detaches it from its layers, which keep their values.
 */
export function styleFinalizer(tx: Transaction): void {
  const store = tx.store;
  const ops = [...tx.ops];
  if (ops.length === 0) return;
  const own = styledValues.get(tx) ?? new Set<string>();
  styledValues.set(tx, own);

  let users: Map<Id, Array<{ readonly id: Id; readonly slot: StyleSlot }>> | null = null;
  const usersOf = (styleId: Id) => {
    if (!users) {
      users = new Map();
      for (const page of store.pages()) {
        for (const id of store.descendants(page, false)) {
          const node = store.get(id);
          if (!node || !isSceneNode(node)) continue;
          for (const slot of SLOTS) {
            const ref = field(node, STYLE_SLOTS[slot].reference);
            if (typeof ref === 'string') users.set(ref, [...(users.get(ref) ?? []), { id, slot }]);
          }
        }
      }
    }
    return users.get(styleId) ?? [];
  };
  const setOwn = (id: Id, name: string, value: unknown) => {
    const node = store.get(id);
    if (!node || same(field(node, name), value)) return;
    tx.set(id, name, value);
    own.add(`${id}\0${name}`);
  };
  // Styles applied in this transaction set their values too; those aren't direct edits.
  const applied = new Set(ops.flatMap((op) => (op.kind === 'set' && SLOTS.some((slot) => STYLE_SLOTS[slot].reference === op.field) ? [`${op.id}\0${op.field}`] : [])));

  for (const op of ops) {
    if (op.kind === 'delete') {
      if (op.node.type === 'STYLE') for (const { id, slot } of usersOf(op.node.id)) if (store.get(id)) setOwn(id, STYLE_SLOTS[slot].reference, undefined);
      continue;
    }
    if (op.kind !== 'set' || own.has(`${op.id}\0${op.field}`)) continue;
    const node = store.get(op.id);
    if (!node) continue;

    if (isStyle(node)) {
      for (const { id, slot } of usersOf(node.id)) {
        const layer = store.get(id);
        const pair = STYLE_SLOTS[slot].fields.find(([, styleField]) => styleField === op.field);
        if (!layer || !isSceneNode(layer) || !pair) continue;
        // Instance layers follow their main component, unless they applied the style themselves.
        if (layer.source !== undefined && !(layer.overrides ?? []).includes(STYLE_SLOTS[slot].reference)) continue;
        setOwn(id, pair[0], copyOf(op.value));
      }
      continue;
    }

    if (!isSceneNode(node)) continue;
    for (const slot of SLOTS) {
      const { reference, fields } = STYLE_SLOTS[slot];
      const styleId = field(node, reference);
      if (typeof styleId !== 'string' || applied.has(`${op.id}\0${reference}`) || !fields.some(([layerField]) => layerField === op.field)) continue;
      // An instance layer taking its main component's value (with the same style) isn't a direct edit.
      const main = node.source === undefined ? undefined : store.get(node.source);
      if (main && field(main, reference) === styleId && same(field(main, op.field), op.value)) continue;
      setOwn(op.id, reference, undefined);
    }
  }
}
