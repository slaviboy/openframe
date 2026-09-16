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

import type { LocalComponent } from '@/editor/commands/insert-instance';
import { useLayerThumbnail } from '../../images/useLayerThumbnail';
import assetStyles from './AssetsPanel.module.css';

/** A component's thumbnail, drawn by the rendering engine from its current state, at most `size` CSS pixels on each side. */
export function ComponentThumbnail({ component, size = 64 }: { component: LocalComponent; size?: number }) {
  const src = useLayerThumbnail(component.pageId, component.id, size);
  const box = { width: size, height: size };
  return src ? <img className={assetStyles.thumbnail} style={box} src={src} alt="" draggable={false} /> : <span className={assetStyles.thumbnail} style={box} />;
}
