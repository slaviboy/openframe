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
import { isSceneNode, type Node, type PageNode, type SceneNode } from '@/core/schema/document';
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
    const ids = new Map<Id, Id>();
    for (const component of components) copyInto(tx, editor, from, component.id, pageId, keyOnTop(tx.store, pageId), ids);
    remap(tx, ids);
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
