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

import { FORMAT_VERSION } from '../schema/document';

/**
 * Forward-only migrations on untyped JSON. `MIGRATIONS[n]` upgrades a document
 * from version n to n + 1. Migrations must be pure and must never be edited after
 * release; fixtures for every historical version live in tests/fixtures/format.
 */
type Migration = (doc: Record<string, unknown>) => Record<string, unknown>;

export const MIGRATIONS: Readonly<Record<number, Migration>> = {};

export class UnsupportedVersionError extends Error {
  constructor(readonly version: unknown) {
    super(
      typeof version === 'number' && version > FORMAT_VERSION
        ? `This file was created by a newer version of Openframe (format ${version}).`
        : `Unsupported document format version: ${String(version)}`,
    );
    this.name = 'UnsupportedVersionError';
  }
}

export function migrateToCurrent(doc: { version: number }, migrations = MIGRATIONS, target = FORMAT_VERSION): unknown {
  const version = doc.version;
  if (!Number.isInteger(version) || version < 1 || version > target) throw new UnsupportedVersionError(version);
  let current = doc as unknown as Record<string, unknown>;
  for (let v = version; v < target; v++) {
    const step = migrations[v];
    if (!step) throw new UnsupportedVersionError(v);
    current = { ...step(current), version: v + 1 };
  }
  return current;
}
