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

import notoColorEmoji from '@fontsource/noto-color-emoji/files/noto-color-emoji-emoji-400-normal.woff2?inline';

/**
 * Noto Color Emoji as a base64 data URL. It is several megabytes, so it lives in its own lazily
 * imported chunk, loaded only when text contains emoji.
 */
export const EMOJI_FONT_DATA: string = notoColorEmoji;
