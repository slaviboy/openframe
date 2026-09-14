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
    tx.create(isRoot ? ({ ...layer, name: rootName(store, mainId) ?? source.name, ...root.fields } as SceneNode) : layer);
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
  // Layers (and copies of nested instances) link to the layer they copy; an instance itself to its main component.
  const id = layer.source ?? (layer.id === root.id && root.type === 'FRAME' ? root.instance?.mainId : undefined);
  const main = id === undefined ? undefined : store.get(id);
  return main && isSceneNode(main) ? main : undefined;
}

/** The component set a main component is a variant of, if any. */
function componentSetOf(store: DocumentStore, mainId: Id): SceneNode | undefined {
  const parentId = store.parentOf(mainId);
  const parent = parentId === null ? undefined : store.get(parentId);
  return parent?.type === 'FRAME' && parent.componentSet ? parent : undefined;
}

/** The name an instance takes from its main component: the component set's name for a variant. */
function rootName(store: DocumentStore, mainId: Id): string | undefined {
  const main = store.get(mainId);
  return componentSetOf(store, mainId)?.name ?? (main && isSceneNode(main) ? main.name : undefined);
}

/** The value an instance layer's field follows: its main layer's, except that instances of a variant are named after the set. */
function mainValue(store: DocumentStore, layer: SceneNode, root: SceneNode, name: string): unknown {
  if (name === 'name' && layer.id === root.id && root.type === 'FRAME' && root.instance) return rootName(store, root.instance.mainId);
  const main = mainLayerOf(store, layer, root);
  return main ? field(main, name) : undefined;
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
      for (const name of layer.overrides) {
        const value = mainValue(store, layer, owner.root, name);
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

/** A change the component finalizer passes on: an edit of the transaction, or a copy of one on a linked layer. */
interface Change {
  readonly id: Id;
  readonly field: string;
  readonly value: unknown;
  readonly prev: unknown;
  readonly edit: boolean;
}

/** An instance layer linked to the layer it copies; `byMain` for an instance linked to its main component. */
interface Link {
  readonly node: SceneNode;
  readonly byMain: boolean;
}

/**
 * Instance layers by the layer they copy: `source` for layers and for copies of nested instances, and the
 * main component for instances placed on their own.
 */
function linkIndex(store: DocumentStore): Map<Id, Link[]> {
  const links = new Map<Id, Link[]>();
  const add = (key: Id, link: Link) => {
    const list = links.get(key);
    if (list) list.push(link);
    else links.set(key, [link]);
  };
  for (const page of store.pages()) {
    for (const id of store.descendants(page, false)) {
      const node = store.get(id);
      if (!node || !isSceneNode(node)) continue;
      if (node.source !== undefined) add(node.source, { node, byMain: false });
      else if (node.type === 'FRAME' && node.instance) add(node.instance.mainId, { node, byMain: true });
    }
  }
  return links;
}

/**
 * Keeps instances in step with their main components (history finalizer; registered first, so it sees
 * the transaction's own edits):
 * - A change on a main component's layer is copied to the matching layer of every instance, unless the
 *   instance overrides that field. The instances' own placement stays; a resize of the main component
 *   resizes instances that still had its previous size.
 * - A change on an instance's layer to a field instances may override is recorded in `overrides`; any
 *   other change (position, size, order, constraints…) is reverted, except the instance's own placement.
 * - Copied changes pass on in turn, so instances nested in components follow through every level: a change
 *   to a nested instance inside a main component reaches the copies of it in that component's instances.
 */
export function componentFinalizer(tx: Transaction): void {
  const store = tx.store;
  const changes: Change[] = tx.ops.flatMap((op) => (op.kind === 'set' && !LINK_FIELDS.has(op.field) ? [{ id: op.id, field: op.field, value: op.value, prev: op.prev, edit: true }] : []));
  if (changes.length === 0) return;
  let links: Map<Id, Link[]> | null = null;
  const linked = (id: Id): Link[] => (links ??= linkIndex(store)).get(id) ?? [];
  const copy = (target: SceneNode, name: string, value: unknown) => {
    const prev = field(target, name);
    if (same(prev, value)) return;
    tx.set(target.id, name, value);
    changes.push({ id: target.id, field: name, value, prev, edit: false });
  };
  for (let i = 0; i < changes.length; i++) {
    const change = changes[i]!;
    const node = store.get(change.id);
    if (!node || !isSceneNode(node)) continue;
    if (change.edit && change.field === 'name' && node.type === 'FRAME' && node.componentSet) {
      // Renaming a component set renames the instances of its variants, unless they were renamed.
      for (const variantId of store.children(change.id)) {
        for (const { node: instance, byMain } of linked(variantId)) if (byMain && !(instance.overrides ?? []).includes('name')) copy(instance, 'name', change.value);
      }
      continue;
    }
    const owner = ownerOf(store, change.id);
    if (!owner) continue;
    const isRoot = owner.root.id === change.id;
    if (change.edit && owner.kind === 'instance') {
      if (isOverridable(change.field)) {
        const overrides = node.overrides ?? [];
        // Back to the main component's value (as when resetting), the field follows the component again.
        const matchesMain = mainLayerOf(store, node, owner.root) !== undefined && same(mainValue(store, node, owner.root, change.field), change.value);
        if (matchesMain && overrides.includes(change.field)) tx.set(change.id, 'overrides', overrides.length > 1 ? overrides.filter((f) => f !== change.field) : undefined);
        else if (!matchesMain && !overrides.includes(change.field)) tx.set(change.id, 'overrides', [...overrides, change.field]);
      } else if (!(isRoot && (ROOT_PLACEMENT.has(change.field) || change.field === 'size'))) {
        tx.set(change.id, change.field, change.prev);
        continue;
      }
    }
    for (const { node: target, byMain } of linked(change.id)) {
      const current = store.get(target.id);
      if (!current || !isSceneNode(current) || (current.overrides ?? []).includes(change.field)) continue;
      if (byMain) {
        // Instances keep their own placement and, for a variant, the component set's name; a resize reaches
        // the instances that still had the previous size.
        if (ROOT_PLACEMENT.has(change.field) || (change.field === 'name' && componentSetOf(store, change.id))) continue;
        if (change.field === 'size' && !same(field(current, 'size'), change.prev)) continue;
      }
      copy(current, change.field, change.value);
    }
  }
}
