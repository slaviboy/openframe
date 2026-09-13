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

import { createContext, useCallback, useContext, useSyncExternalStore } from 'react';
import type { AppSession } from '@/app/bootstrap';
import type { Editor } from '@/editor/editor';
import type { EditorState } from '@/editor/stores/editor-store';

export const SessionContext = createContext<AppSession | null>(null);

export function useSession(): AppSession {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession must be used inside <SessionContext>');
  return session;
}

export const useEditor = (): Editor => useSession().editor;

/** Subscribes to a slice of editor state; re-renders only when the selected value changes. */
export function useEditorState<T>(selector: (state: EditorState) => T): T {
  const editor = useEditor();
  // Selectors must return primitives or references stored in state (never fresh objects),
  // so repeated calls for the same snapshot are stable.
  return useSyncExternalStore(editor.state.subscribe, () => selector(editor.state.getSnapshot()));
}

/**
 * Document revision. Components that derive values from the document call this so they
 * re-render after commits, undo/redo, and live previews during gestures.
 */
export function useDocumentRevision(): number {
  const editor = useEditor();
  const subscribe = useCallback((cb: () => void) => editor.history.subscribe(() => cb()), [editor]);
  return useSyncExternalStore(subscribe, () => editor.doc.rev);
}
