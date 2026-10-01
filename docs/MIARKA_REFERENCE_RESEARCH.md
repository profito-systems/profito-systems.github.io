# Photo measurement research and verification — 2026-09-30

Working patterns studied: Measure on Photo (https://measureonphoto.online/guide), Victor NPB Measure (https://github.com/victornpb/measure), RefScale (https://refscale.app/), and CraftQuantities Photo Takeoff (https://craftquantities.com/tools/photo-takeoff/). Their documentation supports adjustable reference handles, zoom, known dimensions and clear perspective limits. External products were researched; their numerical accuracy was not independently benchmarked.

## Reference rules

Four corners of a planar rectangle with two known dimensions allow projective calibration. The reference and measured points must share one plane. A brick top above a floor cannot calibrate that floor. A single known segment only provides uniform scale and requires a front-facing plane; it cannot recover perspective.

Presets: A4 210 × 297 mm; A5 148 × 210 mm; ID-1 card 85.60 × 53.98 mm. UK nominal brick 215 × 102.5 × 65 mm; selected Polish nominal brick 250 × 120 × 65 mm. Brick faces are selectable and dimensions editable: other formats and manufacturing tolerances exist. Blocks, tiles, phones, books and boxes require actual known dimensions. Coins require a known segment and are not assigned a universal diameter.

Dimension sources: https://www.iso.org/es/contents/data/standard/03/14/31432.html ; https://www.wienerberger.co.uk/products/brick/standard-format-bricks.html ; https://www.wienerberger.pl/produkty/cegly-i-plytki-klinkierowe-terca/cegly-klinkierowe-terca/kosmo-nova.html

## Implementation and tests

Manual calibration and measurements use pure JavaScript homography and Canvas2D, with no OpenCV dependency. OpenCV 4.13.0 is loaded only for optional automatic proposals. A shared loader waits for runtime readiness, has a deadline and permits retry. Legacy OpenCV Module thenables resolve to themselves: resolving a native Promise with that module loops indefinitely, so the loader resolves without a module value. Automatic detections are proposals requiring inspection.

`npm run check` runs syntax/assembly validation, existing reference checks and thirteen regression tests covering perspective geometry, corner ordering, invalid references, known segments, runtime readiness, native Promise and legacy thenable modules, network retry and timeout recovery.

`npm run test:browser` requires Playwright plus its Chromium browser. Optional environment overrides: PLAYWRIGHT_MODULE_PATH, CHROMIUM_EXECUTABLE_PATH. OPENCV_TEST_SCRIPT may point to the official downloaded OpenCV 4.13.0 script to exercise real runtime detection without an external network dependency.

Verified in Chromium: desktop 1280 px and touch layouts 390/320 px; manual measurements; drag handles; axis swap; zoom; annotated PNG; all presets; dimension invalidation; OpenCV network failure and retry. Real OpenCV detected the bundled A4 sample. Pure JavaScript coordinates agreed with OpenCV projective transformation within 0.001 mm on the synthetic perspective fixture. A delayed automatic result did not overwrite newer manual calibration.

Limits: synthetic coordinates and the bundled sample do not establish accuracy on all customer photographs, lens distortion, nonplanar surfaces or depth differences. No live GitHub Pages deployment was verified by these tests.

## Follow-up validation — 2026-10-01

Readiness timeout now removes the stale OpenCV script and unusable module so a retry executes a replacement. Late rejected module callbacks cannot clear the newer runtime. Selecting a photo over 30 MB cancels the previous image load, invalidates the calibration, clears the planner handoff and hides the previous image.

The thirteen-test suite passes, including regressions for these failures. Running the revised suite against the previous application revision produces four failures, confirming that the tests detect the original defects. Browser smoke includes oversized-photo recovery and an actually re-executed detector script after initialization timeout. These new browser cases were not executed in this environment because downloading the Chromium archive failed; previous browser results above apply to the earlier revision.

## Production synchronization

Application and test files are copied one-way from canonical contech-measure commit cbc5d88aa0ccf9f454e6637b95787316024d2d16, PR 13 follow-up revision. Canonical PR 13 must be merged before PR 20. No live deployment of this follow-up was performed.
