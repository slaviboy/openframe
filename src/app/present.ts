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

import type { AppSession } from './bootstrap';
import { IdGenerator, type Id } from '@/core/ids/ids';
import { topLevelFrame } from '@/core/prototype/reactions';
import { Editor } from '@/editor/editor';
import { LocalPersistence, StorageError } from '@/platform/idb/persistence';
import { createReplicaId } from '@/platform/replica';

/** What presentation view shows: a local file's page, starting at a frame (or its first flow). */
export interface PresentParams {
  readonly fileId: string;
  readonly pageId: Id;
  readonly nodeId: Id | null;
}

/** The address of presentation view for a file's page. */
export function presentUrl(base: string, params: PresentParams): string {
  const url = new URL(base);
  url.search = '';
  url.hash = '';
  url.searchParams.set('present', '1');
  url.searchParams.set('file', params.fileId);
  url.searchParams.set('page', params.pageId);
  if (params.nodeId) url.searchParams.set('node', params.nodeId);
  return url.toString();
}

/** Presentation view's parameters from the page address; null for the editor. */
export function presentParams(search: string): PresentParams | null {
  const query = new URLSearchParams(search);
  const fileId = query.get('file');
  const pageId = query.get('page');
  if (query.get('present') !== '1' || !fileId || !pageId) return null;
  return { fileId, pageId, nodeId: query.get('node') || null };
}

export interface PresentationSession {
  readonly editor: Editor;
  readonly fileName: string;
  dispose(): void;
}

/** Attempts at opening browser storage, and the pause between them. */
const STORAGE_ATTEMPTS = 4;
const STORAGE_RETRY_MS = 250;

/**
 * Opens browser storage, trying again for a moment when it reports being unavailable: the editor's tab may still be
 * writing the file when presentation view's tab opens it (WebKit refuses the second connection meanwhile).
 */
async function openStorage(): Promise<LocalPersistence> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await LocalPersistence.open();
    } catch (error) {
      if (!(error instanceof StorageError) || error.reason !== 'unavailable' || attempt >= STORAGE_ATTEMPTS) throw error;
      await new Promise((resolve) => setTimeout(resolve, STORAGE_RETRY_MS * attempt));
    }
  }
}

/** Opens a local file read-only for presentation view, on the page to present. */
export async function openPresentation(params: PresentParams): Promise<PresentationSession> {
  const persistence = await openStorage();
  try {
    const opened = await persistence.openFile(params.fileId);
    const ids = new IdGenerator(createReplicaId());
    const pageId = opened.store.get(params.pageId)?.type === 'PAGE' ? params.pageId : undefined;
    const editor = new Editor({ doc: opened.store, ids, ...(pageId ? { pageId } : {}), readOnly: true });
    // Hit testing, hints and scrolling read layer bounds, so the page's scene index is built up front.
    editor.scene.ensure(editor.pageId);
    editor.images.storage = {
      save: () => Promise.resolve(),
      load: async (hash) => {
        const r = await persistence.getImage(hash);
        return r && { hash: r.hash, bytes: new Uint8Array(r.bytes), mime: r.mime, width: r.width, height: r.height };
      },
    };
    editor.fonts.storage = {
      save: () => Promise.resolve(),
      loadAll: async () => (await persistence.listFonts()).map((r) => ({ ...r, bytes: new Uint8Array(r.bytes) })),
    };
    await editor.fonts.load().catch((error: unknown) => console.warn('Openframe: user fonts could not be loaded', error));
    return { editor, fileName: opened.record.name, dispose: () => persistence.close() };
  } catch (error) {
    persistence.close();
    throw error;
  }
}

/**
 * Present: opens presentation view in a new tab, starting at the selected layer's top-level frame (or the page's first
 * flow). The file is saved first, so the new tab shows every edit.
 */
export function presentFile(session: AppSession, startId?: Id | null): void {
  const { editor } = session;
  const selected = editor.selection[0];
  const nodeId = startId ?? (selected ? topLevelFrame(editor.doc, selected) : null);
  const url = presentUrl(window.location.href, { fileId: session.session.getSnapshot().file.id, pageId: editor.pageId, nodeId });
  // The tab opens while the click still counts as the user's (so it isn't blocked), and loads once the file is saved.
  const tab = window.open('', '_blank');
  void session.autosaver
    .flush()
    .catch(() => undefined)
    .then(() => {
      if (tab) tab.location.href = url;
      else window.open(url, '_blank');
    });
}
