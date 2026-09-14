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
 * Characters drawn as emoji: emoji-presentation pictographs, text-style pictographs followed by the
 * emoji variation selector (❤️), and flag letters. Symbols such as © stay text unless selected as emoji.
 */
const EMOJI = /\p{Emoji_Presentation}|\p{Extended_Pictographic}️|\p{Regional_Indicator}/u;

/** Whether text contains emoji (so the color emoji font is needed to draw it). */
export const containsEmoji = (text: string): boolean => EMOJI.test(text);
