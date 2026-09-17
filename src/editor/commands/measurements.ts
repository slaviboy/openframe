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

import type { Id } from '@/core/ids/ids';
import { measureBetween, type MeasureLine } from '@/core/scene/measure';
import { isSceneNode, type Measurement, type PageNode } from '@/core/schema/document';
import type { Editor } from '../editor';

/** The measurements saved on a page. */
export function measurementsOf(editor: Editor, pageId: Id = editor.pageId): readonly Measurement[] {
  const page = editor.doc.get(pageId);
  return page?.type === 'PAGE' ? (page.measurements ?? []) : [];
}

/** Writes the page's measurements, as one undo step; an empty list takes the field off again. */
function write(editor: Editor, label: string, next: readonly Measurement[], pageId: Id = editor.pageId): boolean {
  const page = editor.doc.get(pageId);
  if (page?.type !== 'PAGE') return false;
  editor.history.run(label, (tx) => tx.set(pageId, 'measurements', next.length === 0 ? undefined : next));
  return true;
}

/** Saves the distance between two layers on the page, so everyone who opens the file sees it. */
export function addMeasurement(editor: Editor, fromId: Id, toId: Id): Id | null {
  const from = editor.doc.get(fromId);
  const to = editor.doc.get(toId);
  if (fromId === toId || !from || !to || !isSceneNode(from) || !isSceneNode(to)) return null;
  const id = editor.ids.next();
  return write(editor, 'Add measurement', [...measurementsOf(editor), { id, fromId, toId }]) ? id : null;
}

/** Removes a measurement. */
export function deleteMeasurement(editor: Editor, id: string): boolean {
  const kept = measurementsOf(editor).filter((measurement) => measurement.id !== id);
  return kept.length === measurementsOf(editor).length ? false : write(editor, 'Delete measurement', kept);
}

/** The text shown instead of the distance; empty text puts the distance back. */
export function setMeasurementLabel(editor: Editor, id: string, label: string): boolean {
  const text = label.trim();
  const next = measurementsOf(editor).map((measurement) => {
    if (measurement.id !== id) return measurement;
    const { label: _previous, ...rest } = measurement;
    return text ? { ...rest, label: text } : rest;
  });
  return write(editor, 'Rename measurement', next);
}

/** Drops the measurements whose layers are gone, which is what deleting a layer leaves behind. */
export function pruneMeasurements(editor: Editor): boolean {
  const kept = measurementsOf(editor).filter((measurement) => editor.doc.get(measurement.fromId) && editor.doc.get(measurement.toId));
  return kept.length === measurementsOf(editor).length ? false : write(editor, 'Delete measurement', kept);
}

/** A saved measurement drawn out: the lines between its two layers, and what it reads. */
export interface DrawnMeasurement {
  readonly id: string;
  readonly lines: readonly MeasureLine[];
  readonly label: string | undefined;
}

/** Every measurement on the page worked out against where its layers are now. */
export function drawnMeasurements(editor: Editor, pageId: Id = editor.pageId): DrawnMeasurement[] {
  const page = editor.doc.get(pageId) as PageNode | undefined;
  if (page?.type !== 'PAGE' || !page.measurements?.length) return [];
  // The bounds come from the scene index, which has to know about the page first.
  editor.scene.ensure(pageId);
  const out: DrawnMeasurement[] = [];
  for (const measurement of page.measurements ?? []) {
    const from = editor.scene.worldBounds(measurement.fromId);
    const to = editor.scene.worldBounds(measurement.toId);
    if (!from || !to) continue;
    const lines = measureBetween(from, to);
    if (lines.length > 0) out.push({ id: measurement.id, lines, ...(measurement.label === undefined ? { label: undefined } : { label: measurement.label }) });
  }
  return out;
}
