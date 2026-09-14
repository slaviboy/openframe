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

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { presentParams } from './app/present';
import { registerServiceWorker } from './platform/sw-register';
import { App } from './ui/App';
import { PresentApp } from './ui/present/PresentApp';
import './ui/global.css';

registerServiceWorker();

// Presentation view opens in its own tab, with the file and page in the address.
const present = presentParams(window.location.search);

createRoot(document.getElementById('root')!).render(<StrictMode>{present ? <PresentApp params={present} /> : <App />}</StrictMode>);
