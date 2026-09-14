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
 * Fields a layer inside a component instance may change (The reference's supported overrides): the layer name
 * and visibility, fill, stroke and effect properties, layout guides, and text properties. Every other
 * field — position, size, order, constraints, auto layout placement, masking, text box resizing —
 * follows the main component.
 */
export const OVERRIDABLE_FIELDS: ReadonlySet<string> = new Set([
  // Layer
  'name',
  'visible',
  'locked',
  'opacity',
  'blendMode',
  'effects',
  // Fill and stroke
  'fills',
  'strokes',
  'strokeWeight',
  'strokeAlign',
  'strokeDashes',
  'strokeCap',
  'strokeJoin',
  'strokeMiterAngle',
  'individualStrokeWeights',
  // Layout guides
  'layoutGuides',
  // Text
  'characters',
  'fontName',
  'fontSize',
  'lineHeight',
  'letterSpacing',
  'textAlignHorizontal',
  'textAlignVertical',
  'styleRuns',
  'textDecoration',
  'decorationStyle',
  'textCase',
  'paragraphSpacing',
  'paragraphIndent',
  'listType',
  'indentation',
  'listSpacing',
  'hyperlink',
  'openTypeFeatures',
  'fontVariations',
  'textDirection',
  'leadingTrim',
]);

/** Whether an instance layer may keep its own value for a field instead of following the main component. */
export const isOverridable = (field: string): boolean => OVERRIDABLE_FIELDS.has(field);
