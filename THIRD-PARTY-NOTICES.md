# Third-party notices

Browser Xray distributes or links against the following third-party software.
This file is a summary, not legal advice.

## Xray-core

- Version: 26.10.21
- License: Mozilla Public License 2.0 (MPL-2.0)
- Source: https://github.com/XTLS/Xray-core
- Bundled license text: `dist/helper/LICENSE-Xray-core.txt`
- Bundled files: `xray.exe`, `geoip.dat`, `geosite.dat`

The Xray-core binary is redistributed unmodified. Its source code is available
at the URL above. No Xray-core source files were modified for this project.

## React and React DOM

- Version: 19.x
- License: MIT
- Copyright: Meta Platforms, Inc. and affiliates
- Source: https://github.com/facebook/react

The extension bundle includes React and React DOM.

## Go runtime and golang.org/x/sys

- License: BSD 3-Clause
- Source: https://go.dev/ and https://pkg.go.dev/golang.org/x/sys

The Go runtime is statically linked into `browser-xray-helper.exe`.
`golang.org/x/sys` is used for Windows Job Object and process APIs.

## Build-time tools

The following tools are used during development and are not included in the
runtime distribution (except for code bundled into the extension by Vite):

- Vite - MIT - https://github.com/vitejs/vite
- TypeScript - Apache-2.0 - https://github.com/microsoft/TypeScript
- esbuild - MIT - https://github.com/evanw/esbuild
- Vitest - MIT - https://github.com/vitest-dev/vitest
- @vitejs/plugin-react - MIT - https://github.com/vitejs/vite-plugin-react
- @types/chrome - MIT - https://github.com/DefinitelyTyped/DefinitelyTyped
- Inno Setup - Inno Setup License - https://jrsoftware.org/isinfo.php
  Used to build the optional single-file Windows installer; Inno Setup is not
  redistributed with Browser Xray.
- Node.js / npm - MIT / Artistic-2.0 - build environment only

## MIT license text

Copyright (c) the respective authors.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## BSD 3-Clause license text

Copyright (c) 2009 The Go Authors. All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice,
   this list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.
3. Neither the name of Google Inc. nor the names of its contributors may be
   used to endorse or promote products derived from this software without
   specific prior written permission.

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
