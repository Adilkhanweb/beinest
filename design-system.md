# beinest · UI/UX decisions

## Revision: compact graphite / safety orange

`refresh.css`, loaded after the base stylesheet, defines graphite surfaces and an orange accent in both themes. The workspace omits promotional hero text and local-profile decoration. Original SVG paints are not theme-tinted or darkened, and sheet backgrounds are consistently transparent across rendering modes. The bounded gallery presents one sheet per row or a compact multi-column grid; the layout switch sits beside the rendering modes. Fullscreen gives the gallery the remaining viewport height. Parameter presets are the first settings section, outside the initially collapsed advanced disclosure, and persist separately from geometry projects. Search-budget controls use integer seconds (1–300) and never mutate a recorded chart's time domain. RU, KK and EN interface choices persist locally.

## Skill used

`ui-ux-pro-max`, local design-system search: `industrial engineering dashboard minimal`.

Verified matching style: **Minimalism & Swiss Style**, suitable for enterprise dashboards. Adopted geometric composition, substantial whitespace, neutral slate/graphite, safety-orange accent. Typography has since moved to Noto Sans for complete Kazakh coverage and consistent metrics. The search's marketing “Hero + Features + CTA” layout was not applicable and was intentionally rejected in favour of a task-oriented workspace.

## Structure

- Persistent graphite navigation on desktop; drawer with dismissible backdrop on mobile.
- Top: four metrics with compact supplementary data visuals.
- Primary: SVG cutting sheet with part geometry and visible selection.
- Secondary: focused settings/parts tabs, inline validation, explicit run/stop control.
- Bottom: material balance donut with textual numbers; real time-series chart.

## Tokens

All primary surface/text/line/accent tokens have independent light/dark values in `styles.css`. Typography is self-hosted official Noto Sans, including Kazakh Cyrillic; its SIL Open Font License is bundled locally. Spacing generally follows a 4 px base; panels use 12 px radii with restrained shadows. Part-number labels are rendered above all part paths, scale to at least 14 screen pixels, and use an icon-only tag toggle with an accessible name.

## Data honesty

The opening project has an accessible import dropzone and no demo parts or stock placeholder. Imported polygons preview source geometry without creating a nesting result; an active calculation keeps its captured stock dimensions. Engine runs use the actual vendored Nestbolt WASM, not random/artificial optimization. Every intermediate layout delivered by the worker is rendered on the map and sampled by the progress chart; this is not a replay of every internal optimizer candidate. Unvalidated live layouts cannot be exported. Stopping commits the latest independently validated snapshot; if none exists, the last committed map stays intact. Successful runs commit validated output. Metrics and SVG export are based on validated engine output. Displayed utilization uses the **entire stock sheet area**, including trailing offcuts. The optimizer's material-scoring metric can differ because it credits reusable trailing offcuts. No fixed claim of percentage savings is made.

Elapsed analytics use explicit localized units (`0 мин 0 сек` / `0 min 0 sec`), while chart ticks retain compact m:ss. The iteration count means received intermediate layouts, not every internal optimizer candidate. Stopping commits the latest successful worker snapshot after independent validation, with actual elapsed time, iteration count, chart duration and the matching request. Validation is coalesced in a separate worker so a previously validated snapshot is available if a later candidate is invalid. With no successful snapshot, the previously committed result is retained. Late search messages are token-guarded.

## Export safety

The default scope is **all sheets**, independent of the selected viewer card. All sheets download as one SVG with physical sheet extents separated by 100 mm horizontally. Each nested viewport preserves the real engine geometry and millimeter scale. Explicit selected-sheet scope downloads only that sheet. Export preferences persist locally without dirtying the validated geometry. The optional sheet outline is off by default: enabling it adds the actual stock boundary as cut geometry to every exported SVG, not a cosmetic viewer border. User-facing help warns that the machine may cut this boundary too. Viewer modes and labels do not define exported manufacturing geometry.

## Accessibility and feedback

Desktop navigation can be dismissed and reopened with the always-available menu button. Its collapsed preference persists independently of the mobile drawer; hidden navigation is inert and exposes its state through ARIA. Export and the square, icon-only export-settings disclosure share one row; options flow below across both columns rather than overlaying the workspace.

Library strips use stable **part-type numbers**, shared by every placed copy of that type. Number, thumbnail, dimensions, icon-only native checkbox and quantity fit one row; filenames remain only in accessible names and tooltips. A native main button makes the thumbnail/dimensions keyboard-selectable. Selected rows have a highlighted background and a checked input, synchronized with all copies on the map. Selecting geometry never forces a settings-tab change. Preview paint follows original/outline/generated-color viewer modes. Checkerboard colors follow the theme; actual white SVG artwork is never darkened. White/no-stroke parts receive only a subpixel viewing guide, never a replacement fill or additional exported cut geometry. Ordinary external SVG DOCTYPE metadata is stripped locally before paint parsing; entity declarations and internal DTDs remain unsupported, and no external resource is fetched.

Saved projects have persistent IDs: renaming must update the same record and must not silently overwrite a name collision. Deleting a saved record leaves loaded geometry intact. Full saved parameter sets are editable local records including the initial defaults; an empty saved list must remain empty after reload. Creation/editing validates names and integer millimeter dimensions (50–10000), and destructive actions require confirmation. Management actions are blocked during search or export.

Semantic headings, explicitly named icon controls, visible focus styles, native modal-dialog focus handling, escape dismissal, keyboard-selectable shapes and keyboard-operable tab controls. Upload button provides an alternative to file dragging. Reduced-motion disables transitions/animations. Settings report invalid values before running. Native progress and a polite status toast communicate results. Theme persists locally. Sidebar scrolls on short/landscape viewports.

## Browser verification

Automated Chromium scripts target 375×812, 390×844, 768×1024, 812×375, 1024×900, 1440×1080, 1920×1200, including both themes and reduced-motion, and assert no horizontal overflow, failed assets or JavaScript page errors. Integration tests cover real WASM execution, valid placements, SVG import/export, cancellation, local project persistence and invalid-input feedback. The export regression compares combined sheet geometry with native engine SVGs, measures the 100 mm sheet gap, verifies filename metadata and the optional sheet cut border. Legacy ZIP utilities retain separate unit coverage but are not used by the UI. Its two-sheet result comes from a real engine run; inherited seven-sheet fixtures are explicitly UI-only and not search/export evidence. Reports and screenshots are generated in `test-results/`; test definitions alone are not evidence that a pending revision has passed.
## Unified saved parameters and import canvas
The empty canvas is an accessible native upload/drop target. After import, show engine polygons grouped by original filename with source-relative positions and colors, not empty stock or an invented nesting result. Cartesian Y is reflected once for the whole drawing; preview geometry does not contribute to placed-part or sheet statistics. Uploaded markup is never inserted into live DOM.
Saved sizes and full parameter sets share one migrated versioned library and card-based dialog. The right sidebar summary occupies at most two text rows; saving is offered only when live values differ from the selected baseline. Full editor includes dimensions, spacing, margins, rotation, seconds, advanced and import settings. Preserve old storage on migration errors, preserve explicit empty libraries, and never silently auto-apply configuration on page reload.
