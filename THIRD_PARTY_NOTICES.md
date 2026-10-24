# Third-party notices

Chess Coach's application source is licensed under GPL-3.0-or-later. The components below retain their own copyright notices and license terms.

## Stockfish.js

- **Component:** Stockfish.js 19.0.1, the WebAssembly build of Stockfish 19.
- **Authors:** the Stockfish team, Nathan Rugg, and the upstream contributors.
- **License:** GNU General Public License, version 3; see [the included license](public/engine/COPYING.txt).
- **Source and build instructions:** [nmrugg/stockfish.js](https://github.com/nmrugg/stockfish.js).
- **Distribution used by this project:** [stockfish 19.0.1 on npm](https://www.npmjs.com/package/stockfish/v/19.0.1), pinned by `package-lock.json`.

The engine files are copied from the installed package during setup. Generated JavaScript and WebAssembly engine files are not stored in this repository.

## Cburnett chess pieces

- **Files:** the twelve SVGs in `public/pieces/`.
- **Author:** Colin M. L. Burnett.
- **License:** GNU General Public License, version 2 or later; see [GPL-2.0](LICENSES/GPL-2.0.txt).
- **Source:** [the Cburnett piece set in Lichess](https://github.com/lichess-org/lila/tree/master/public/piece/cburnett).
- **Upstream attribution:** [Lichess's copying exceptions](https://github.com/lichess-org/lila/blob/master/COPYING.md).

## chess.js

- **Component:** chess.js 1.4.0.
- **Author:** Jeff Hlywa and contributors.
- **License:** BSD 2-Clause.
- **Source:** [jhlywa/chess.js](https://github.com/jhlywa/chess.js).

The license supplied with the installed package follows:

```text
Copyright (c) 2025, Jeff Hlywa (jhlywa@gmail.com)
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice,
   this list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE
LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
POSSIBILITY OF SUCH DAMAGE.
```

## Development tools

Vite, esbuild, Prettier, Playwright, and their transitive dependencies retain the licenses distributed with their packages. Exact versions are recorded in `package-lock.json`; their license files are included in the installed dependencies.
