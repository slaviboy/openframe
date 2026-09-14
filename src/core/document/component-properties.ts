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

import type { Id } from '../ids/ids';
import { isSceneNode, type ComponentPropertyDefinition, type SceneNode } from '../schema/document';
import { isInstance, isMainComponent } from './instances';
import { isComponentSet, variantsOf } from './variants';

export type ComponentPropertyType = ComponentPropertyDefinition['type'];

/** What a component property drives on a layer: its visibility, its text, or (`mainComponent`) the component a nested instance is. */
export type BoundField = 'visible' | 'characters' | 'mainComponent' | 'slot';

/** The field each component property type drives: boolean properties layer visibility, text properties text content, instance swap properties a nested instance's component. */
export const PROPERTY_FIELD: Readonly<Record<ComponentPropertyType, BoundField>> = { BOOLEAN: 'visible', TEXT: 'characters', INSTANCE_SWAP: 'mainComponent', SLOT: 'slot' };

/** The part of the document store component properties are read from. */
interface PropertyStore {
  get(id: Id): unknown;
  parentOf(id: Id): Id | null;
  children(id: Id): readonly Id[];
  descendants(id: Id, includeSelf: boolean): Iterable<Id>;
}

const sceneNodeAt = (store: PropertyStore, id: Id | null): SceneNode | undefined => {
  const node = id === null ? undefined : store.get(id);
  return node && isSceneNode(node as Parameters<typeof isSceneNode>[0]) ? (node as SceneNode) : undefined;
};

/**
 * The node holding the component properties a layer follows: for a main component or one of its layers, the
 * component set when the component is a variant, otherwise the main component; for an instance or one of its
 * layers, the owner of its main component. Null outside components.
 */
export function propertyOwner(store: PropertyStore, id: Id): SceneNode | null {
  for (let cur: Id | null = id; cur !== null; cur = store.parentOf(cur)) {
    const node = sceneNodeAt(store, cur);
    if (!node) return null;
    if (isComponentSet(node)) return node;
    if (node.type === 'FRAME' && node.instance) return sceneNodeAt(store, node.instance.mainId) ? propertyOwner(store, node.instance.mainId) : null;
    if (isMainComponent(node)) {
      const parent = sceneNodeAt(store, store.parentOf(cur));
      return parent && isComponentSet(parent) ? parent : node;
    }
  }
  return null;
}

/** Whether a layer is an instance or inside one. */
export function isInInstance(store: PropertyStore, id: Id): boolean {
  for (let cur: Id | null = id; cur !== null; cur = store.parentOf(cur)) {
    const node = sceneNodeAt(store, cur);
    if (!node) return false;
    if (isInstance(node)) return true;
  }
  return false;
}

/**
 * The owner whose component properties a layer can be bound to: the main component (or component set) it is nested
 * in. Null for main components and component sets themselves and for layers of instances; an instance nested in a
 * main component can be bound (its visibility, or its component with an instance swap property).
 */
export function bindingOwner(store: PropertyStore, id: Id): SceneNode | null {
  const node = sceneNodeAt(store, id);
  const parentId = store.parentOf(id);
  if (!node || parentId === null || isMainComponent(node) || isComponentSet(node) || isInInstance(store, parentId)) return null;
  return propertyOwner(store, parentId);
}

/** The component properties of an owner, by name in creation order. */
export function propertyDefinitions(owner: SceneNode | null): Readonly<Record<string, ComponentPropertyDefinition>> {
  return owner?.type === 'FRAME' ? (owner.componentPropertyDefinitions ?? {}) : {};
}

/** The main components an owner's properties are applied in: every variant of a component set, or the main component itself. */
export function ownerComponents(store: PropertyStore, owner: SceneNode): SceneNode[] {
  return isComponentSet(owner) ? variantsOf(store, owner.id) : [owner];
}

/** The layers of a main component, variant or instance (the root included) bound to a component property, with the field each follows. */
export function boundLayers(store: PropertyStore, rootId: Id, name: string): Array<{ readonly id: Id; readonly field: BoundField }> {
  const bound: Array<{ readonly id: Id; readonly field: BoundField }> = [];
  for (const id of [rootId, ...store.descendants(rootId, false)]) {
    const references = sceneNodeAt(store, id)?.componentPropertyReferences;
    if (!references) continue;
    for (const field of ['visible', 'characters', 'mainComponent', 'slot'] as const) if (references[field] === name) bound.push({ id, field });
  }
  return bound;
}

type FrameLayer = Extract<SceneNode, { type: 'FRAME' }>;

/** Whether an instance's component has properties an exposed instance would show: component properties, or variants. */
function showsProperties(store: PropertyStore, instance: FrameLayer): boolean {
  const owner = instance.instance ? propertyOwner(store, instance.instance.mainId) : null;
  return owner !== null && (Object.keys(propertyDefinitions(owner)).length > 0 || isComponentSet(owner));
}

/** The instance a layer is inside (its nearest instance ancestor), or null. */
function enclosingInstance(store: PropertyStore, id: Id): Id | null {
  for (let cur = store.parentOf(id); cur !== null; cur = store.parentOf(cur)) {
    const node = sceneNodeAt(store, cur);
    if (!node) return null;
    if (isInstance(node)) return cur;
  }
  return null;
}

/**
 * The nested instances of a main component (or of a component set's variants) that can be exposed: instances in the
 * component, not inside other instances, whose components have properties to show, or that are exposed already.
 */
export function exposableInstances(store: PropertyStore, owner: SceneNode): FrameLayer[] {
  const found: FrameLayer[] = [];
  for (const main of ownerComponents(store, owner)) {
    for (const id of store.descendants(main.id, false)) {
      const node = sceneNodeAt(store, id);
      if (node?.type !== 'FRAME' || !node.instance || enclosingInstance(store, id) !== null) continue;
      if (node.isExposedInstance || showsProperties(store, node)) found.push(node);
    }
  }
  return found;
}

/** The exposed nested instances whose properties an instance shows: its copies of the instances exposed in its component. */
export function exposedInstances(store: PropertyStore, instanceId: Id): FrameLayer[] {
  const found: FrameLayer[] = [];
  for (const id of store.descendants(instanceId, false)) {
    const node = sceneNodeAt(store, id);
    if (node?.type === 'FRAME' && node.instance && node.isExposedInstance && enclosingInstance(store, id) === instanceId) found.push(node);
  }
  return found;
}
