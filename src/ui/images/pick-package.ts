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

import { PACKAGE_EXTENSION } from '@/platform/package';

/** Opens the file picker for an Openframe file; resolves with the chosen one, or null when nothing was chosen. */
export function pickPackageFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = PACKAGE_EXTENSION;
    input.addEventListener('change', () => resolve(input.files?.[0] ?? null), { once: true });
    // A picker that is closed without choosing anything never fires change, so the promise is settled on focus too.
    window.addEventListener('focus', () => setTimeout(() => resolve(input.files?.[0] ?? null), 300), { once: true });
    input.click();
  });
}
