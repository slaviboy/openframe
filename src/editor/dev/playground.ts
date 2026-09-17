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

import type { Transaction } from '@/core/history/history';
import type { Id } from '@/core/ids/ids';
import { previewInstanceProperties, type PropertyValue } from '../commands/component-properties';
import type { Editor } from '../editor';

/**
 * Dev Mode's component playground: shows an instance with its component properties turned other ways, without any of
 * it reaching the file. The whole of it lives in one transaction that is never committed — letting go of the
 * playground puts the instance back exactly as the file has it.
 */
export class PlaygroundPreview {
  private tx: Transaction | null = null;
  private shown: string | null = null;

  constructor(private readonly editor: Editor) {
    editor.devPreview = this;
  }

  /** Stops showing the playground and lets go of the editor. */
  dispose(): void {
    this.clear();
    if (this.editor.devPreview === this) this.editor.devPreview = null;
  }

  /** Shows the instance with these property values; nothing to show puts it back. */
  show(instanceId: Id, values: Readonly<Record<string, PropertyValue>>): void {
    const key = `${instanceId}:${JSON.stringify(values)}`;
    if (key === this.shown) return;
    this.clear();
    if (Object.keys(values).length === 0) return;
    const tx = this.editor.history.begin('Component playground');
    if (!previewInstanceProperties(this.editor, tx, instanceId, values)) {
      this.editor.history.cancel(tx);
      return;
    }
    tx.flushPreview();
    this.tx = tx;
    this.shown = key;
    this.editor.requestRender();
  }

  /** Puts the instance back as the file has it. */
  clear(): void {
    if (!this.tx) return;
    const tx = this.tx;
    this.tx = null;
    this.shown = null;
    this.editor.history.cancel(tx);
    this.editor.requestRender();
  }

  get active(): boolean {
    return this.tx !== null;
  }
}
