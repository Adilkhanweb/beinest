# Nestbolt engine integration

UI fonts: Fira Sans, copyright Carrois Apostrophe, SIL Open Font License 1.1.
Font license retained at `assets/fonts/LICENSE.txt`; font files are self-hosted.

The actual compiled Nestbolt browser engine is vendored locally, not simulated.

| File | Upstream source |
| --- | --- |
| `assets/vendor/worker-Bpfw-h0X.js` | https://skulitom.github.io/Nestbolt/assets/worker-Bpfw-h0X.js |
| `assets/vendor/nestbolt_wasm_bg-ZkdddWS9.wasm` | https://skulitom.github.io/Nestbolt/assets/nestbolt_wasm_bg-ZkdddWS9.wasm |
| `assets/vendor/LICENSE` | https://github.com/skulitom/Nestbolt/blob/main/LICENSE |
| `assets/vendor/THIRD_PARTY_NOTICES` | https://github.com/skulitom/Nestbolt/blob/main/THIRD_PARTY_NOTICES |

Nestbolt copyright (c) 2026 Artem and Nestbolt contributors. Original Nestbolt
code is MIT-licensed; the complete license is retained in `assets/vendor/LICENSE`.
Dependencies retain their own licenses; the complete upstream inventory and
source links are retained in `assets/vendor/THIRD_PARTY_NOTICES`.
In particular jagua-rs 1.1.0 is used unmodified under MPL-2.0, with source at
https://github.com/JeroenGar/jagua-rs and https://crates.io/crates/jagua-rs/1.1.0.
The Sparrow-derived overlap-area penalty is MIT, copyright (c) 2025 Jeroen
Gardeyn, KU Leuven; its full notice is retained in `assets/vendor/Sparrow_LICENSE`.
No upstream benchmark datasets or Studio UI are included.

## Asset integrity

SHA-256 of the unmodified upstream downloads:

```text
188deeaad97e595f6aba2b3ce7d51e10adf141984dd4e340abcb5b05181f0f49  worker-Bpfw-h0X.js
c360ddb014f51f5da0017a1efc1e7b6662c778ffe3c4b7a894dc73643a23822b  nestbolt_wasm_bg-ZkdddWS9.wasm
```

## Browser API

```js
import { NestEngine } from './engine.js';
const engine = new NestEngine();
const files = await Promise.all([...input.files].map(f => engine.readFile(f)));
const library = await engine.importFiles(files);
const request = {
  parts: library.parts.map(p => ({ id: p.id, quantity: 1,
    rotations: { kind: 'step', degrees: 90 }, allow_mirror: false, priority: 1 })),
  sheets: [{ id: 'stock-1', width_mm: 600, height_mm: 400, count: null,
    margins_mm: { left: 5, right: 5, bottom: 5, top: 5 }, defects_mm: [] }],
  spacing_mm: 3, edge_spacing_mm: 1, mode: 'all'
};
const result = await engine.run(library, request, {
  seconds: 5, onProgress: ({ t, material, layout }) => { /* optional preview */ }
});
const svg = await engine.exportSheet(library, request, result.layout,
  result.layout.sheets[0].id, 'svg');
```

All engine operations are asynchronous; `stop()` synchronously terminates the
search worker and rejects its pending run with `AbortError`. A later run creates
a fresh worker. `dispose()` also releases the import/export worker. The engine
does not mutate library/request. `Engine` is an alias of `NestEngine`; singleton
functions `importFiles`, `run`, `exportSheet`, `stop` are also exported.

Result fields: `layout`, `validation`, `seed`, `seconds`, `repeatable`,
`parts_in_holes`, optional `common_line` and `lead_in`. Metrics live at
`result.validation.metrics`, including `sheets_used`, `placed_parts`,
`requested_parts`, `utilization` (fraction), `material_area`, `placed_area`.
Progress is `{t, material, layout?}`; `t` is elapsed seconds. Progress layouts
are previews; only the final result is guaranteed validated.

Layout is `{version, units, sheets:[{id,stock_id}], placements:[{part_id,
copy_index,sheet_id,transform:{translation:[x,y],rotation_radians,mirrored}}]}`.
Coordinates are millimeters. Apply mirror, then rotate, then translate to part
geometry. Library polygons use `{outer:[[x,y],...],holes:[[[x,y],...],...]}`;
prefer `part.components` when present, otherwise `[part.polygon]`.
Full upstream TypeScript schemas and worker protocol source are retained in
`assets/vendor/web-src-types.ts` and `assets/vendor/web-src-worker.ts`.

Serve over HTTP(S). Worker and WASM URLs resolve relative to this module.
No external runtime dependency, framework, API key, COOP/COEP header or network
request to upstream is needed after these local assets have loaded. The server
should serve `.wasm` as `application/wasm` (the upstream loader has a fallback).

## Interface font: Noto Sans

The interface uses the complete Noto Sans variable font, including extended
Cyrillic/Kazakh glyphs, self-hosted at `assets/fonts/noto-sans-variable.ttf`.
Upstream source: Google Fonts repository, `ofl/notosans/NotoSans[wdth,wght].ttf`.
It is distributed under the SIL Open Font License 1.1; the original copyright
and license are included in `assets/fonts/NOTO-OFL.txt`.
The previously bundled Fira Sans files are retained but no longer used by the
interface; their license remains in `assets/fonts/LICENSE.txt`.

## Engine smoke test

Run `node assets/vendor/smoke-test.mjs` with Node 22+; no packages are required.
The test adds browser Worker/fetch adapters only and executes the unchanged
vendored worker and WASM. It imports an SVG, nests three copies, validates the
layout, exports SVG and DXF, checks cancellation and starts a fresh search.
Verified successfully with Node 24.22.1: one imported part, three placements,
three progress events, 711-byte SVG, 2016-byte DXF, cancellation and restart.
Very small search budgets (e.g. 0.2 seconds) can legitimately produce the
engine's "no complete layout" error; the default budget is five seconds.