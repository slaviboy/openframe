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

/** Keys that could pollute object prototypes when untrusted JSON is merged or spread. */
const FORBIDDEN_KEYS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype']);

export class UntrustedJsonError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UntrustedJsonError';
  }
}

/**
 * Parses JSON from an untrusted source (files, clipboard, imports). Rejects prototype
 * pollution keys anywhere in the structure. Callers must still validate the shape.
 */
export function parseUntrustedJson(text: string): unknown {
  try {
    return JSON.parse(text, (key, value: unknown) => {
      if (FORBIDDEN_KEYS.has(key)) throw new UntrustedJsonError(`Forbidden key "${key}"`);
      return value;
    });
  } catch (error) {
    if (error instanceof UntrustedJsonError) throw error;
    throw new UntrustedJsonError('Content is not valid JSON');
  }
}
