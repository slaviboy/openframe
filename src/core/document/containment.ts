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

import type { NodeType } from '../schema/document';

/**
 * Which node types may be direct children of which. Pages and sections hold any layer;
 * frames and groups hold any layer except sections (sections stay at the top of the
 * canvas hierarchy, optionally nested in other sections). Leaf layers hold nothing.
 */
export function canParent(parent: NodeType, child: NodeType): boolean {
  switch (parent) {
    case 'DOCUMENT':
      return child === 'PAGE';
    case 'PAGE':
    case 'SECTION':
      return child !== 'DOCUMENT' && child !== 'PAGE';
    case 'FRAME':
    case 'GROUP':
      return child !== 'DOCUMENT' && child !== 'PAGE' && child !== 'SECTION';
    // Boolean groups combine shapes, vectors, text and other groups — not frames, sections or slices.
    case 'BOOLEAN_OPERATION':
      return child !== 'DOCUMENT' && child !== 'PAGE' && child !== 'SECTION' && child !== 'FRAME' && child !== 'SLICE';
    default:
      return false;
  }
}
