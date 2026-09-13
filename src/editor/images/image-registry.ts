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

/** Decoded-size metadata plus the encoded bytes of an image referenced by image paints. */
export interface ImageAsset {
  /** Lowercase hex SHA-256 of `bytes`. */
  readonly hash: string;
  readonly bytes: Uint8Array;
  readonly mime: string;
  readonly width: number;
  readonly height: number;
}

/** Durable storage for image assets (IndexedDB in the app). */
export interface ImageStoragePort {
  save(asset: ImageAsset): Promise<void>;
  load(hash: string): Promise<ImageAsset | undefined>;
}

/**
 * In-memory image assets for the open document. Assets are added on import (and persisted
 * through the storage port) or loaded lazily the first time the renderer asks for a hash.
 * Listeners run when an asset becomes available, so the canvas can redraw.
 */
export class ImageRegistry {
  private readonly assets = new Map<string, ImageAsset>();
  private readonly pending = new Set<string>();
  private readonly missing = new Set<string>();
  private readonly listeners = new Set<() => void>();
  storage: ImageStoragePort | null = null;

  get(hash: string): ImageAsset | undefined {
    return this.assets.get(hash);
  }

  /** Whether a load was attempted and storage has no such image. */
  isMissing(hash: string): boolean {
    return this.missing.has(hash);
  }

  /** Adds an asset to memory right away, then persists it; rejects if storage fails. */
  async add(asset: ImageAsset): Promise<void> {
    if (!this.assets.has(asset.hash)) {
      this.assets.set(asset.hash, asset);
      this.missing.delete(asset.hash);
      this.notify();
    }
    await this.storage?.save(asset);
  }

  /** Loads an asset that is not in memory yet; listeners run when it arrives. */
  request(hash: string): void {
    if (this.assets.has(hash) || this.pending.has(hash) || this.missing.has(hash) || !this.storage) return;
    this.pending.add(hash);
    this.storage
      .load(hash)
      .then((asset) => {
        this.pending.delete(hash);
        if (asset && !this.assets.has(hash)) {
          this.assets.set(hash, asset);
          this.notify();
        } else if (!asset) {
          this.missing.add(hash);
        }
      })
      .catch((error: unknown) => {
        this.pending.delete(hash);
        this.missing.add(hash);
        console.warn(`Openframe: image ${hash} could not be loaded`, error);
      });
  }

  /** Resolves once every requested load has settled (for tests). */
  async settled(): Promise<void> {
    while (this.pending.size > 0) await new Promise((resolve) => setTimeout(resolve, 0));
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}
