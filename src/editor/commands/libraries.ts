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

import { keyOnTop, makePage } from '@/core/document/factory';
import type { DocumentStore } from '@/core/document/store';
import type { Transaction } from '@/core/history/history';
import { ROOT_ID, type Id } from '@/core/ids/ids';
import { isSceneNode, type Node, type Paint, type PageNode, type SceneNode } from '@/core/schema/document';
import { localCollections } from '@/core/variables/document';
import { boundVariablesOf } from './dev-resources';
import type { Editor } from '../editor';

/** A library brought into this file: the pages holding its components, by the name it was imported under. */
export interface ImportedLibrary {
  readonly pageId: Id;
  readonly name: string;
  readonly importedAt: string;
  readonly components: number;
}

/** The libraries this file holds. */
export function importedLibraries(editor: Editor): ImportedLibrary[] {
  const out: ImportedLibrary[] = [];
  for (const id of editor.doc.pages()) {
    const page = editor.doc.get(id) as PageNode | undefined;
    if (page?.type !== 'PAGE' || !page.library) continue;
    out.push({ pageId: id, name: page.library.name, importedAt: page.library.importedAt, components: countComponents(editor.doc, id) });
  }
  return out;
}

/** How many main components a page holds, which is what a library is counted in. */
function countComponents(store: DocumentStore, pageId: Id): number {
  let count = 0;
  for (const id of store.children(pageId)) {
    const node = store.get(id);
    if (node?.type === 'FRAME' && (node.component || node.componentSet)) count += 1;
  }
  return count;
}

/** The main components a store has to lend: the ones sitting straight on one of its pages. */
export function libraryComponentsOf(store: DocumentStore): SceneNode[] {
  const out: SceneNode[] = [];
  for (const pageId of store.pages()) {
    for (const id of store.children(pageId)) {
      const node = store.get(id);
      if (node?.type === 'FRAME' && (node.component || node.componentSet)) out.push(node);
    }
  }
  return out;
}

/**
 * Copies a layer and everything under it out of another document and into this one, giving everything fresh ids. The
 * references a component keeps to its own layers are remapped as they are copied; ones pointing outside what is
 * copied are dropped, since there is nothing here for them to point at.
 */
function copyInto(tx: Transaction, editor: Editor, from: DocumentStore, sourceId: Id, parent: Id, key: string, ids: Map<Id, Id>): Id {
  const source = from.getOrThrow(sourceId) as Node;
  if (!isSceneNode(source)) throw new Error('Only layers can be brought in from a library');
  const id = editor.ids.next();
  ids.set(sourceId, id);
  tx.create({ ...source, id, parent: { id: parent, key } } as Node);
  for (const childId of from.children(sourceId)) {
    const child = from.get(childId);
    if (child && isSceneNode(child)) copyInto(tx, editor, from, childId, id, child.parent.key, ids);
  }
  return id;
}

/** Points the copied layers' references at their copies, and drops the ones that led outside. */
function remap(tx: Transaction, ids: Map<Id, Id>): void {
  for (const id of ids.values()) {
    const node = tx.store.get(id);
    if (!node || !isSceneNode(node)) continue;
    if ('source' in node && node.source !== undefined) {
      const mapped = ids.get(node.source);
      tx.set(id, 'source', mapped);
    }
    if (node.type === 'FRAME' && node.instance) {
      const mapped = ids.get(node.instance.mainId);
      // An instance of something that was not brought in stands on its own instead.
      tx.set(id, 'instance', mapped === undefined ? undefined : { mainId: mapped });
    }
  }
}

/**
 * Copies the variables the library's components are bound to, with the collections holding them, and returns
 * which variable of this file each one of theirs became. A variable marked as kept out of publishing is left
 * behind, and the components bound to it simply lose that binding, as they would against a library without it.
 */
function copyVariables(tx: Transaction, editor: Editor, from: DocumentStore, components: readonly SceneNode[]): Map<Id, Id> {
  const wanted = new Set<Id>();
  for (const component of components) {
    for (const id of [component.id, ...from.descendants(component.id, false)]) {
      const node = from.get(id);
      if (node && isSceneNode(node)) for (const entry of boundVariablesOf(node)) wanted.add(entry.variableId);
    }
  }
  const ids = new Map<Id, Id>();
  const collections = new Map<Id, Id>();
  for (const variableId of wanted) {
    const variable = from.get(variableId);
    if (variable?.type !== 'VARIABLE' || variable.hiddenFromPublishing) continue;
    const collection = from.get(variable.parent.id);
    if (collection?.type !== 'VARIABLE_COLLECTION') continue;
    let collectionId = collections.get(collection.id);
    if (collectionId === undefined) {
      collectionId = editor.ids.next();
      collections.set(collection.id, collectionId);
      tx.create({ ...collection, id: collectionId, name: freeCollectionName(tx.store, collection.name), parent: { id: collection.parent.id, key: keyOnTop(tx.store, collection.parent.id) } });
    }
    const copyId = editor.ids.next();
    ids.set(variableId, copyId);
    tx.create({ ...variable, id: copyId, parent: { id: collectionId, key: keyOnTop(tx.store, collectionId) } });
  }
  return ids;
}

/** A name for a copied collection that is not already taken, so the library's and the file's own stay apart. */
function freeCollectionName(store: DocumentStore, wanted: string): string {
  const taken = new Set(localCollections(store).map((collection) => collection.name));
  if (!taken.has(wanted)) return wanted;
  for (let i = 2; ; i += 1) if (!taken.has(`${wanted} ${i}`)) return `${wanted} ${i}`;
}

/** Points the copied layers' variable bindings at the copied variables, dropping the ones left behind. */
function remapVariables(tx: Transaction, layers: Iterable<Id>, variables: ReadonlyMap<Id, Id>): void {
  for (const id of layers) {
    const node = tx.store.get(id);
    if (!node || !isSceneNode(node)) continue;
    const bound = node.boundVariables;
    if (bound) {
      const next = Object.fromEntries(
        Object.entries(bound).flatMap(([field, alias]) => {
          const mapped = alias && typeof alias === 'object' && 'id' in alias ? variables.get(alias.id) : undefined;
          return mapped === undefined ? [] : [[field, { ...alias, id: mapped }]];
        }),
      );
      tx.set(id, 'boundVariables', Object.keys(next).length > 0 ? next : undefined);
    }
    for (const field of ['fills', 'strokes'] as const) {
      const paints = field in node ? (node as SceneNode & Record<typeof field, readonly Paint[]>)[field] : undefined;
      // Only a solid paint carries a colour binding, which is what a colour variable is bound to.
      const bindings = paints?.map((paint) => (paint.type === 'SOLID' ? paint.boundVariables?.color : undefined));
      if (!paints || !bindings?.some((alias) => alias !== undefined)) continue;
      tx.set(
        id,
        field,
        paints.map((paint, index) => {
          const alias = bindings[index];
          if (!alias || paint.type !== 'SOLID') return paint;
          const mapped = variables.get(alias.id);
          const { boundVariables: _bound, ...rest } = paint;
          return mapped === undefined ? rest : { ...rest, boundVariables: { color: { ...alias, id: mapped } } };
        }),
      );
    }
  }
}

/** A name for the library page that is not already taken. */
function freeName(editor: Editor, wanted: string): string {
  const taken = new Set(editor.doc.pages().map((id) => editor.doc.get(id)?.name));
  if (!taken.has(wanted)) return wanted;
  for (let i = 2; ; i += 1) if (!taken.has(`${wanted} ${i}`)) return `${wanted} ${i}`;
}

/**
 * Brings another file in as a library: its main components are copied onto a page of their own, marked as that
 * library, so they can be inserted from the Assets panel like any other component. Nothing else of the file comes
 * with them. Returns the page they landed on, or null when the file lends nothing.
 */
export function importLibrary(editor: Editor, from: DocumentStore, name: string, now = new Date().toISOString()): { readonly pageId: Id; readonly components: number } | null {
  const components = libraryComponentsOf(from);
  if (components.length === 0) return null;
  const pageName = freeName(editor, name);
  let pageId: Id = '';
  editor.history.run('Import library', (tx) => {
    pageId = editor.ids.next();
    tx.create(makePage(pageId, pageName, keyOnTop(tx.store, ROOT_ID)));
    tx.set(pageId, 'library', { name, importedAt: now });
    const variables = copyVariables(tx, editor, from, components);
    const ids = new Map<Id, Id>();
    for (const component of components) copyInto(tx, editor, from, component.id, pageId, keyOnTop(tx.store, pageId), ids);
    remap(tx, ids);
    remapVariables(tx, ids.values(), variables);
  });
  return { pageId, components: components.length };
}

/** Takes a library out of the file, with the components it brought. */
export function removeLibrary(editor: Editor, pageId: Id): boolean {
  const page = editor.doc.get(pageId) as PageNode | undefined;
  if (page?.type !== 'PAGE' || !page.library) return false;
  // A file always keeps a page of its own, so the library's page can only go when it is not the only one.
  if (editor.doc.pages().length <= 1) return false;
  editor.history.run('Remove library', (tx) => {
    for (const id of [...tx.store.children(pageId)]) tx.delete(id);
    tx.delete(pageId);
  });
  return true;
}

/**
 * A fingerprint of a component as it stands: what it is made of, named and sized. Two components with the same
 * fingerprint are the same design, which is how a library's copy is told from a newer one.
 */
export function componentSignature(store: DocumentStore, id: Id): string {
  const node = store.get(id);
  if (!node || !isSceneNode(node)) return '';
  const own = `${node.type}:${node.name}:${Math.round(node.size.width)}x${Math.round(node.size.height)}:${Math.round(node.opacity * 100)}`;
  const children = store.children(id).map((child) => componentSignature(store, child));
  return children.length === 0 ? own : `${own}[${children.join(',')}]`;
}

/** What a newer copy of a library would change: the components added, taken away and redrawn since it was brought in. */
export interface LibraryUpdates {
  readonly added: readonly string[];
  readonly removed: readonly string[];
  readonly changed: readonly string[];
}

/** The components a library page holds, by name. */
function byName(store: DocumentStore, pageId: Id): Map<string, Id> {
  const out = new Map<string, Id>();
  for (const id of store.children(pageId)) {
    const node = store.get(id);
    if (node?.type === 'FRAME' && (node.component || node.componentSet)) out.set(node.name, id);
  }
  return out;
}

/**
 * Reads a newer copy of a library against the one in the file. Components are matched by name, since the copy here
 * was given ids of its own when it came across.
 */
export function libraryUpdates(editor: Editor, pageId: Id, from: DocumentStore): LibraryUpdates {
  const here = byName(editor.doc, pageId);
  const there = new Map(libraryComponentsOf(from).map((node) => [node.name, node.id] as const));
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];
  for (const [name, id] of there) {
    const mine = here.get(name);
    if (mine === undefined) added.push(name);
    else if (componentSignature(editor.doc, mine) !== componentSignature(from, id)) changed.push(name);
  }
  for (const name of here.keys()) if (!there.has(name)) removed.push(name);
  return { added, removed, changed };
}

/**
 * Takes a newer copy of a library: a component that has been redrawn is rebuilt in place, so the instances of it
 * keep pointing at the same component and take the new design; a new one is brought in, and one that is gone is
 * left alone rather than pulled out from under the instances still using it.
 */
export function applyLibraryUpdates(editor: Editor, pageId: Id, from: DocumentStore): LibraryUpdates | null {
  const page = editor.doc.get(pageId) as PageNode | undefined;
  if (page?.type !== 'PAGE' || !page.library) return null;
  const updates = libraryUpdates(editor, pageId, from);
  if (updates.added.length === 0 && updates.changed.length === 0) return updates;

  const there = new Map(libraryComponentsOf(from).map((node) => [node.name, node] as const));
  editor.history.run('Update library', (tx) => {
    const here = byName(tx.store, pageId);
    const ids = new Map<Id, Id>();
    for (const name of updates.changed) {
      const source = there.get(name);
      const mine = here.get(name);
      if (!source || mine === undefined) continue;
      // The component keeps its id, so every instance of it follows; only what it is made of is renewed.
      for (const child of [...tx.store.children(mine)]) tx.delete(child);
      const { id: _id, parent: _parent, ...fields } = source;
      for (const [field, value] of Object.entries(fields)) tx.set(mine, field, value);
      ids.set(source.id, mine);
      for (const childId of from.children(source.id)) {
        const child = from.get(childId);
        if (child && isSceneNode(child)) copyInto(tx, editor, from, childId, mine, child.parent.key, ids);
      }
    }
    for (const name of updates.added) {
      const source = there.get(name);
      if (source) copyInto(tx, editor, from, source.id, pageId, keyOnTop(tx.store, pageId), ids);
    }
    remap(tx, ids);
    tx.set(pageId, 'library', { name: page.library!.name, importedAt: new Date().toISOString() });
  });
  return updates;
}

/**
 * Points the instances of one library's components at another library's, matching by name. What the other library
 * has no component for is left where it is.
 */
export function swapLibrary(editor: Editor, fromPageId: Id, toPageId: Id): number {
  const from = byName(editor.doc, fromPageId);
  const to = byName(editor.doc, toPageId);
  const moves = new Map<Id, Id>();
  for (const [name, id] of from) {
    const other = to.get(name);
    if (other !== undefined && other !== id) moves.set(id, other);
  }
  if (moves.size === 0) return 0;

  let swapped = 0;
  const instances: { readonly id: Id; readonly mainId: Id }[] = [];
  for (const pageId of editor.doc.pages()) {
    for (const id of editor.doc.descendants(pageId, false)) {
      const node = editor.doc.get(id);
      const mainId = node?.type === 'FRAME' ? node.instance?.mainId : undefined;
      if (mainId !== undefined && moves.has(mainId)) instances.push({ id, mainId });
    }
  }
  if (instances.length === 0) return 0;
  editor.history.run('Swap library', (tx) => {
    for (const { id, mainId } of instances) {
      tx.set(id, 'instance', { mainId: moves.get(mainId)! });
      swapped += 1;
    }
  });
  return swapped;
}
