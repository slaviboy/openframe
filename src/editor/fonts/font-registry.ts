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

/** A font added by the user: uploaded from a file, or read from the fonts installed on this device. */
export interface UserFont {
  /** Lowercase hex SHA-256 of `bytes`. */
  readonly id: string;
  readonly family: string;
  readonly style: string;
  readonly bytes: Uint8Array;
  readonly variable: boolean;
  readonly source: 'upload' | 'local';
}

/** Durable storage for user fonts (IndexedDB in the app). */
export interface FontStoragePort {
  save(font: UserFont): Promise<void>;
  loadAll(): Promise<UserFont[]>;
}

/**
 * The user's fonts, shared by every local file. Fonts are kept in memory once loaded or added and
 * persisted through the storage port; listeners run when fonts become available, so the text
 * engine can register them and the canvas can redraw.
 */
export class FontRegistry {
  private readonly fonts = new Map<string, UserFont>();
  private readonly listeners = new Set<() => void>();
  private version = 0;
  storage: FontStoragePort | null = null;

  list(): readonly UserFont[] {
    return [...this.fonts.values()];
  }

  /** Increments whenever fonts are added (a stable snapshot for UI subscriptions). */
  get revision(): number {
    return this.version;
  }

  /** Adds fonts not added before (by content), persists them, and returns the new ones. */
  async add(fonts: readonly UserFont[]): Promise<UserFont[]> {
    const added: UserFont[] = [];
    for (const font of fonts) {
      if (this.fonts.has(font.id) || added.some((f) => f.id === font.id)) continue;
      this.fonts.set(font.id, font);
      added.push(font);
    }
    if (added.length > 0) this.notify();
    for (const font of added) await this.storage?.save(font);
    return added;
  }

  /** Loads the stored fonts (at startup). */
  async load(): Promise<void> {
    if (!this.storage) return;
    const stored = await this.storage.loadAll();
    let changed = false;
    for (const font of stored) {
      if (this.fonts.has(font.id)) continue;
      this.fonts.set(font.id, font);
      changed = true;
    }
    if (changed) this.notify();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.version++;
    for (const listener of this.listeners) listener();
  }
}
