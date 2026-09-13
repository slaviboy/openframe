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

import { useCallback, useEffect, useRef } from 'react';
import type { Transaction } from '@/core/history/history';
import { useEditor } from './useEditor';

/**
 * Groups continuous property edits (scrubbing, color dragging, arrow nudges) into one
 * undoable transaction. `change` applies within the open transaction, or as a standalone
 * transaction when no gesture is active.
 */
export function useGesture(label: string) {
  const editor = useEditor();
  const txRef = useRef<Transaction | null>(null);

  const start = useCallback(() => {
    if (txRef.current || editor.history.inTransaction) return;
    txRef.current = editor.history.begin(label);
  }, [editor, label]);

  const change = useCallback(
    (apply: (tx: Transaction) => void) => {
      const tx = txRef.current;      if (tx) {
        apply(tx);
        tx.flushPreview();
        editor.requestRender();
      } else if (!editor.history.inTransaction) {
        editor.history.run(label, apply);
      }
    },
    [editor, label],
  );

  const end = useCallback(() => {
    const tx = txRef.current;
    txRef.current = null;
    if (tx) editor.history.commit(tx);
  }, [editor]);

  useEffect(() => () => end(), [end]);

  return { start, change, end };
}
