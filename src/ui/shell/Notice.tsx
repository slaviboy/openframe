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

import { useEffect, useSyncExternalStore } from 'react';
import type { ToolManager } from '@/editor/tools/tool-manager';
import styles from './Notice.module.css';

/** A transient message at the top of the canvas (import failures and similar); dismisses itself after 6 s. */
export function Notice({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 6000);
    return () => clearTimeout(timer);
  }, [message, onClose]);
  return (
    <div className={styles.notice} role="alert">
      <span>{message}</span>
      <button type="button" className={styles.close} aria-label="Dismiss" onClick={onClose}>
        ×
      </button>
    </div>
  );
}

/** Shown while Place image holds images: what the next click places, how many remain, and Place all. */
export function PlaceImageHint({ tools }: { tools: ToolManager }) {
  const pending = useSyncExternalStore(tools.imageTool.subscribe, () => tools.imageTool.pending);
  const next = pending[0];
  if (!next) return null;
  return (
    <div className={styles.notice} role="status" data-testid="place-image-hint">
      <span>
        Click to place {next.name}
        {pending.length > 1 ? ` · ${pending.length} images left` : ''} · Esc or Delete to discard
      </span>
      {pending.length > 1 && (
        <button type="button" className={styles.action} onClick={() => tools.imageTool.placeAll()}>
          Place all
        </button>
      )}
    </div>
  );
}

/** A short instruction while a pick-on-canvas tool is active. */
export function ToolHint({ text }: { text: string }) {
  return (
    <div className={styles.notice} role="status" data-testid="tool-hint">
      {text}
    </div>
  );
}
