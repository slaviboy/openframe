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

import {
  boundLayers,
  isInInstance,
  ownerComponents,
  PROPERTY_FIELD,
  propertyDefinitions,
  propertyOwner,
  type ComponentPropertyType,
} from '@/core/document/component-properties';
import { isInstance, isMainComponent } from '@/core/document/instances';
import { componentSetProperties, isComponentSet } from '@/core/document/variants';
import type { Transaction } from '@/core/history/history';
import type { Id } from '@/core/ids/ids';
import type { ComponentPropertyDefinition, SceneNode } from '@/core/schema/document';
import type { Editor } from '../editor';

type Definitions = Readonly<Record<string, ComponentPropertyDefinition>>;
type PropertyValue = boolean | string;

const sceneNode = (editor: Editor, id: Id): SceneNode | undefined => editor.doc.get(id) as SceneNode | undefined;

/** Whether a node can have component properties: a component set, or a main component that isn't a variant. */
export function canHaveProperties(editor: Editor, id: Id): boolean {
  const node = sceneNode(editor, id);
  return node !== undefined && (isComponentSet(node) || (isMainComponent(node) && propertyOwner(editor.doc, id)?.id === id));
}

/** Names used by an owner's component properties and, for a component set, its variant properties. */
function takenNames(editor: Editor, owner: SceneNode): Set<string> {
  const variantProperties = isComponentSet(owner) ? componentSetProperties(editor.doc, owner.id).map((p) => p.name) : [];
  return new Set([...Object.keys(propertyDefinitions(owner)), ...variantProperties]);
}

function setDefinitions(tx: Transaction, ownerId: Id, definitions: Definitions): void {
  tx.set(ownerId, 'componentPropertyDefinitions', Object.keys(definitions).length > 0 ? definitions : undefined);
}

/** The layer's property references without the given field; undefined when none remain. */
function referencesWithout(layer: SceneNode, field: string): SceneNode['componentPropertyReferences'] {
  const rest = Object.fromEntries(Object.entries(layer.componentPropertyReferences ?? {}).filter(([f, name]) => f !== field && name !== undefined));
  return Object.keys(rest).length > 0 ? (rest as SceneNode['componentPropertyReferences']) : undefined;
}

/** A definition of `type` with `value` as its default, or null when the value has the wrong type. */
function definitionOf(type: ComponentPropertyType, value: PropertyValue): ComponentPropertyDefinition | null {
  if (type === 'BOOLEAN') return typeof value === 'boolean' ? { type, defaultValue: value } : null;
  return typeof value === 'string' ? { type, defaultValue: value } : null;
}

/**
 * Creates a component property on a main component or component set with a name (unique among its component
 * and variant properties) and a default value. One undo step.
 */
export function createComponentProperty(editor: Editor, ownerId: Id, type: ComponentPropertyType, name: string, defaultValue: PropertyValue): boolean {
  const owner = sceneNode(editor, ownerId);
  const trimmed = name.trim();
  const definition = definitionOf(type, defaultValue);
  if (!owner || !definition || !canHaveProperties(editor, ownerId) || trimmed === '' || takenNames(editor, owner).has(trimmed)) return false;
  editor.history.run('Create component property', (tx) => setDefinitions(tx, ownerId, { ...propertyDefinitions(owner), [trimmed]: definition }));
  return true;
}

/**
 * Applies a component property to a layer of a main component or variant, or removes it with null. The layer's
 * visibility (boolean properties) or text (text properties, on text layers) follows the property and takes its
 * default value. Layers of instances can't be bound. One undo step.
 */
export function applyComponentProperty(editor: Editor, layerId: Id, type: ComponentPropertyType, name: string | null): boolean {
  const layer = sceneNode(editor, layerId);
  const owner = propertyOwner(editor.doc, layerId);
  const field = PROPERTY_FIELD[type];
  if (!layer || !owner || isInInstance(editor.doc, layerId) || (field === 'characters' && layer.type !== 'TEXT')) return false;
  const definition = name === null ? undefined : propertyDefinitions(owner)[name];
  if (name !== null && definition?.type !== type) return false;
  const rest = referencesWithout(layer, field);
  editor.history.run(name === null ? 'Remove component property' : 'Apply component property', (tx) => {
    tx.set(layerId, 'componentPropertyReferences', name === null ? rest : { ...rest, [field]: name });
    if (definition) tx.set(layerId, field, definition.defaultValue);
  });
  return true;
}

/**
 * Changes a property's default value: the layers bound to it in the component (or every variant) take the value,
 * and so do the instances that haven't changed them. One undo step.
 */
export function setComponentPropertyDefault(editor: Editor, ownerId: Id, name: string, value: PropertyValue): boolean {
  const owner = sceneNode(editor, ownerId);
  const definitions = owner ? propertyDefinitions(owner) : {};
  const current = definitions[name];
  const definition = current ? definitionOf(current.type, value) : null;
  if (!owner || !current || !definition || current.defaultValue === value) return false;
  editor.history.run('Change property default', (tx) => {
    setDefinitions(tx, ownerId, { ...definitions, [name]: definition });
    for (const main of ownerComponents(tx.store, owner)) for (const { id, field } of boundLayers(tx.store, main.id, name)) tx.set(id, field, value);
  });
  return true;
}

/** Renames a component property, keeping its place, and the layers bound to it follow. False for an empty or used name. */
export function renameComponentProperty(editor: Editor, ownerId: Id, from: string, to: string): boolean {
  const owner = sceneNode(editor, ownerId);
  const name = to.trim();
  const definitions = owner ? propertyDefinitions(owner) : {};
  if (!owner || !Object.hasOwn(definitions, from) || name === '' || takenNames(editor, owner).has(name)) return false;
  editor.history.run('Rename property', (tx) => {
    setDefinitions(tx, ownerId, Object.fromEntries(Object.entries(definitions).map(([n, d]) => [n === from ? name : n, d])));
    for (const main of ownerComponents(tx.store, owner)) {
      for (const { id, field } of boundLayers(tx.store, main.id, from)) {
        const layer = tx.store.getOrThrow(id) as SceneNode;
        tx.set(id, 'componentPropertyReferences', { ...layer.componentPropertyReferences, [field]: name });
      }
    }
  });
  return true;
}

/** Deletes a component property; the layers bound to it keep their current values. One undo step. */
export function deleteComponentProperty(editor: Editor, ownerId: Id, name: string): boolean {
  const owner = sceneNode(editor, ownerId);
  const definitions = owner ? propertyDefinitions(owner) : {};
  if (!owner || !Object.hasOwn(definitions, name)) return false;
  editor.history.run('Delete property', (tx) => {
    setDefinitions(tx, ownerId, Object.fromEntries(Object.entries(definitions).filter(([n]) => n !== name)));
    for (const main of ownerComponents(tx.store, owner)) {
      for (const { id, field } of boundLayers(tx.store, main.id, name)) tx.set(id, 'componentPropertyReferences', referencesWithout(tx.store.getOrThrow(id) as SceneNode, field));
    }
  });
  return true;
}

/** An instance's value for a component property: what its bound layers show, or else the property's default. */
export function instancePropertyValue(editor: Editor, instanceId: Id, name: string): PropertyValue | undefined {
  const definition = propertyDefinitions(propertyOwner(editor.doc, instanceId))[name];
  if (!definition) return undefined;
  const [first] = boundLayers(editor.doc, instanceId, name);
  const value = first ? (sceneNode(editor, first.id) as unknown as Record<string, unknown> | undefined)?.[first.field] : undefined;
  return typeof value === typeof definition.defaultValue ? (value as PropertyValue) : definition.defaultValue;
}

/** Sets a component property on an instance: its bound layers take the value, as changes on the instance. One undo step. */
export function setInstanceProperty(editor: Editor, instanceId: Id, name: string, value: PropertyValue): boolean {
  const instance = sceneNode(editor, instanceId);
  const definition = propertyDefinitions(propertyOwner(editor.doc, instanceId))[name];
  const bound = boundLayers(editor.doc, instanceId, name);
  if (!instance || !isInstance(instance) || !definition || typeof value !== typeof definition.defaultValue || bound.length === 0) return false;
  editor.history.run('Change instance property', (tx) => bound.forEach(({ id, field }) => tx.set(id, field, value)));
  return true;
}
