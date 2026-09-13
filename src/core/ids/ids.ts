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

/**
 * Node and entity IDs have the form `<replica>:<counter>`.
 *
 * - `replica` identifies an editing session lineage (random, base36, provided by the
 *   platform layer so core stays free of crypto/DOM). Two replicas never produce the
 *   same ID, so content copied between tabs, files, or branches cannot collide.
 * - `counter` is monotonic within a replica.
 *
 * Deterministic in tests: construct with a fixed replica and start counter.
 */
export type Id = string;

const ID_PATTERN = /^[0-9a-z]{1,12}:[0-9]+$/;

export const isId = (value: unknown): value is Id => typeof value === 'string' && ID_PATTERN.test(value);

export class IdGenerator {
  private counter: number;

  constructor(
    readonly replica: string,
    start = 1,
  ) {
    if (!/^[0-9a-z]{1,12}$/.test(replica)) throw new Error(`Invalid replica "${replica}"`);
    this.counter = start;
  }

  next(): Id {
    return `${this.replica}:${this.counter++}`;
  }

  /** Ensures future IDs from this replica never collide with IDs already in a document. */
  observe(id: Id): void {
    const sep = id.indexOf(':');
    if (id.slice(0, sep) !== this.replica) return;
    const n = Number(id.slice(sep + 1));
    if (n >= this.counter) this.counter = n + 1;
  }
}

/** Reserved ID of the document root node. */
export const ROOT_ID = '0:0' as const;
