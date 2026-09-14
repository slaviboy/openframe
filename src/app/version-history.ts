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

/** The setting naming the earlier version the app shows (read-only) instead of the file as it is now. */
export const VIEW_VERSION_KEY = 'viewVersion';

export interface VersionView {
  readonly fileId: string;
  readonly versionId: string;
}

/** How long after the last version (or since the file was opened) a save adds an autosave checkpoint. */
export const AUTOSAVE_CHECKPOINT_INTERVAL_MS = 30 * 60 * 1000;

/** Whether a save now should add an autosave checkpoint to the version history. */
export function checkpointDue(lastVersionAt: string | undefined, openedAt: string, now: string, intervalMs = AUTOSAVE_CHECKPOINT_INTERVAL_MS): boolean {
  const since = Date.parse(lastVersionAt !== undefined && lastVersionAt > openedAt ? lastVersionAt : openedAt);
  return Date.parse(now) - since >= intervalMs;
}
