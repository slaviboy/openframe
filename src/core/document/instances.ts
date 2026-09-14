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
import type { Id } from '../ids/ids';
import { isSceneNode, type SceneNode } from '../schema/document';
import { isOverridable } from './instance-fields';
import type { DocumentStore } from './store';

/** Fields that link layers to components; the sync never copies or reverts them. */
const LINK_FIELDS: ReadonlySet<string> = new Set(['id', 'parent', 'component', 'instance', 'source', 'overrides']);

/** An instance's own placement: set on the instance itself and never taken from the main component. */
const ROOT_PLACEMENT: ReadonlySet<string> = new Set([
  'transform',
  'constraints',
  'constrainProportions',
  'layoutSizingHorizontal',
  'layoutSizingVertical',
  'layoutPositioning',
  'gridColumnSpan',
  'gridRowSpan',
  'gridColumn',
  'gridRow',
  'gridChildHorizontalAlign',
  'gridChildVerticalAlign',
  'minWidth',
  'maxWidth',
  'minHeight',
  'maxHeight',
  'locked',
  'visible',
]);

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const field = (node: SceneNode, name: string): unknown => (node as unknown as Record<string, unknown>)[name];

/** Whether a layer is a main component. */
export const isMainComponent = (node: SceneNode | undefined): boolean => node?.type === 'FRAME' && node.component !== undefined;

/** Whether a layer is a component instance. */
export const isInstance = (node: SceneNode | undefined): boolean => node?.type === 'FRAME' && node.instance !== undefined;

/** A copy of a layer for an instance: no component marker or overrides, linked to `source` (or, for the instance itself, to its main component). */
function instanceLayer(node: SceneNode, id: Id, parent: SceneNode['parent'], link: { readonly mainId: Id } | { readonly source: Id }): SceneNode {
  const copy: Record<string, unknown> = { ...node, id, parent };
  delete copy['component'];
  delete copy['overrides'];
  delete copy['source'];
  if ('mainId' in link) copy['instance'] = { mainId: link.mainId };
  else copy['source'] = link.source;
  return copy as unknown as SceneNode;
}

/**
 * Creates an instance of a main component under `parent`, mirroring its layers, and returns its id.
 * `root` can give the instance frame a fixed id and fields of its own (such as its placement).
 */
export function instantiate(
  tx: Transaction,
  mainId: Id,
  parent: Id,
  key: string,
  nextId: () => Id,
  root: { readonly id?: Id; readonly fields?: Readonly<Record<string, unknown>> } = {},
): Id {
  const store = tx.store;
  const clone = (sourceId: Id, parentRef: SceneNode['parent'], isRoot: boolean): Id => {
    const source = store.getOrThrow(sourceId) as SceneNode;
    const id = isRoot && root.id !== undefined ? root.id : nextId();
    const layer = instanceLayer(source, id, parentRef, isRoot ? { mainId } : { source: sourceId });
    tx.create(isRoot && root.fields ? ({ ...layer, ...root.fields } as SceneNode) : layer);
    for (const childId of store.children(sourceId)) {
      const child = store.get(childId);
      if (child && isSceneNode(child)) clone(childId, { id, key: child.parent.key }, false);
    }
    return id;
  };
  return clone(mainId, { id: parent, key }, true);
}

/**
 * Swap instance: rebuilds an instance from another main component under the same id, keeping its own
 * placement. Changes made on the instance are kept on the layers of the new component with the same name
 * and type (The reference preserves overrides by layer name); the instance frame keeps its own changes too.
 */
export function swapInstance(tx: Transaction, instanceId: Id, mainId: Id, nextId: () => Id): boolean {
  const store = tx.store;
  const instance = store.get(instanceId);
  const main = store.get(mainId);
  if (!instance || !isSceneNode(instance) || !isInstance(instance) || !main || !isSceneNode(main) || !isMainComponent(main)) return false;
  if (instance.type === 'FRAME' && instance.instance?.mainId === mainId) return false;
  const overriddenValues = (layer: SceneNode) => Object.fromEntries((layer.overrides ?? []).map((name) => [name, field(layer, name)]));
  const kept = new Map<string, Record<string, unknown>>();
  for (const id of store.descendants(instanceId, false)) {
    const layer = store.get(id);
    const key = layer && isSceneNode(layer) ? `${layer.type}\0${layer.name}` : '';
    if (layer && isSceneNode(layer) && layer.overrides && !kept.has(key)) kept.set(key, overriddenValues(layer));
  }
  const rootChanges = overriddenValues(instance);
  const placement = Object.fromEntries([...ROOT_PLACEMENT].filter((name) => field(instance, name) !== undefined).map((name) => [name, field(instance, name)]));
  const parent = instance.parent;
  tx.delete(instanceId);
  instantiate(tx, mainId, parent.id, parent.key, nextId, { id: instanceId, fields: placement });
  // Restoring the kept changes records them as overrides again (the sync finalizer sees these edits).
  for (const [name, value] of Object.entries(rootChanges)) tx.set(instanceId, name, value);
  for (const id of store.descendants(instanceId, false)) {
    const layer = store.get(id);
    const changes = layer && isSceneNode(layer) ? kept.get(`${layer.type}\0${layer.name}`) : undefined;
    if (changes) for (const [name, value] of Object.entries(changes)) tx.set(id, name, value);
  }
  return true;
}

/** Pasted copies of a main component's layers become an instance of it (while it is still in the document). */
export function pastedInstanceLayer(node: SceneNode, id: Id, parent: SceneNode['parent'], root: boolean): SceneNode {
  return instanceLayer(node, id, parent, root ? { mainId: node.id } : { source: node.id });
}

/** The nearest component or instance a layer belongs to (itself included). */
function ownerOf(store: DocumentStore, id: Id): { readonly kind: 'main' | 'instance'; readonly root: SceneNode } | null {
  for (let cur: Id | null = id; cur !== null; cur = store.parentOf(cur)) {
    const node = store.get(cur);
    if (!node || !isSceneNode(node)) return null;
    if (isInstance(node)) return { kind: 'instance', root: node };
    if (isMainComponent(node)) return { kind: 'main', root: node };
  }
  return null;
}

/** The main component's layer an instance layer mirrors: the main component itself for the instance frame. */
function mainLayerOf(store: DocumentStore, layer: SceneNode, root: SceneNode): SceneNode | undefined {
  const id = layer.id === root.id && root.type === 'FRAME' ? root.instance?.mainId : layer.source;
  const main = id === undefined ? undefined : store.get(id);
  return main && isSceneNode(main) ? main : undefined;
}

/**
 * Reset all changes: every overridden field of the given instances (with their layers) or instance
 * layers takes the main component's value again, and the layers follow the component for it.
 */
export function resetOverrides(tx: Transaction, ids: readonly Id[]): void {
  const store = tx.store;
  for (const id of ids) {
    const owner = ownerOf(store, id);
    if (owner?.kind !== 'instance') continue;
    const layers = id === owner.root.id ? [id, ...store.descendants(id, false)] : [id];
    for (const layerId of layers) {
      const layer = store.get(layerId);
      if (!layer || !isSceneNode(layer) || !layer.overrides) continue;
      const main = mainLayerOf(store, layer, owner.root);
      for (const name of layer.overrides) {
        const value = main ? field(main, name) : undefined;
        // Document values are plain JSON data, so a JSON round trip copies them.
        tx.set(layerId, name, value === undefined ? undefined : (JSON.parse(JSON.stringify(value)) as unknown));
      }
      tx.set(layerId, 'overrides', undefined);
    }
  }
}

/** Whether any of the given layers is, or contains, an instance layer with overrides. */
export function hasOverrides(store: DocumentStore, ids: readonly Id[]): boolean {
  return ids.some((id) => {
    const owner = ownerOf(store, id);
    if (owner?.kind !== 'instance') return false;
    const layers = id === owner.root.id ? [id, ...store.descendants(id, false)] : [id];
    return layers.some((layerId) => {
      const layer = store.get(layerId);
      return layer !== undefined && isSceneNode(layer) && (layer.overrides?.length ?? 0) > 0;
    });
  });
}

/**
 * Keeps instances in step with their main components (history finalizer; registered first, so it sees
 * the transaction's own edits):
 * - A change on a main component's layer is copied to the matching layer of every instance, unless the
 *   instance overrides that field. The instances' own placement stays; a resize of the main component
 *   resizes instances that still had its previous size.
 * - A change on an instance's layer to a field instances may override is recorded in `overrides`; any
 *   other change (position, size, order, constraints…) is reverted, except the instance's own placement.
 */
export function componentFinalizer(tx: Transaction): void {
  const store = tx.store;
  const ops = tx.ops.filter((op) => op.kind === 'set' && !LINK_FIELDS.has(op.field));
  if (ops.length === 0) return;
  let byMain: Map<Id, SceneNode[]> | null = null;
  const instancesOf = (mainId: Id): SceneNode[] => {
    if (!byMain) {
      byMain = new Map();
      for (const page of store.pages()) {
        for (const id of store.descendants(page, false)) {
          const node = store.get(id);
          if (node?.type === 'FRAME' && node.instance) byMain.set(node.instance.mainId, [...(byMain.get(node.instance.mainId) ?? []), node]);
        }
      }
    }
    return byMain.get(mainId) ?? [];
  };
  for (const op of ops) {
    if (op.kind !== 'set') continue;
    const owner = ownerOf(store, op.id);
    const node = store.get(op.id);
    if (!owner || !node || !isSceneNode(node)) continue;
    const isRoot = owner.root.id === op.id;
    if (owner.kind === 'instance') {
      if (isOverridable(op.field)) {
        const overrides = node.overrides ?? [];
        // Back to the main component's value (as when resetting), the field follows the component again.
        const main = mainLayerOf(store, node, owner.root);
        const matchesMain = main !== undefined && same(field(main, op.field), op.value);
        if (matchesMain && overrides.includes(op.field)) tx.set(op.id, 'overrides', overrides.length > 1 ? overrides.filter((f) => f !== op.field) : undefined);
        else if (!matchesMain && !overrides.includes(op.field)) tx.set(op.id, 'overrides', [...overrides, op.field]);
      } else if (!(isRoot && (ROOT_PLACEMENT.has(op.field) || op.field === 'size'))) {
        tx.set(op.id, op.field, op.prev);
      }
      continue;
    }
    if (isRoot && ROOT_PLACEMENT.has(op.field)) continue;
    for (const instance of instancesOf(owner.root.id)) {
      const target = isRoot
        ? instance
        : [...store.descendants(instance.id, false)]
            .map((id) => store.get(id))
            .find((n): n is SceneNode => n !== undefined && isSceneNode(n) && n.source === op.id);
      if (!target || (target.overrides ?? []).includes(op.field)) continue;
      if (isRoot && op.field === 'size' && !same(field(target, 'size'), op.prev)) continue;
      tx.set(target.id, op.field, op.value);
    }
  }
}
