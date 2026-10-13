# Lerp checks

This page consumes the shipped shared ColorMagic engine and navbar from the root
site. `lerp-theme.js` is a page-only adapter. Midnight/Reset restores the original
palette and background, while custom choices recolor the existing two glows and
50px grid. No shared assets or other page sources are changed.

Run `node --test tests/*.test.cjs` for deterministic math and source contracts.
Run `node tests/browser.cjs` with Playwright and Chrome installed for rendering,
all six canvases, themes, modal focus, persistence, mobile overflow and original
composition checks. The browser suite needs `LERP_BASELINE_ROOT` containing the
original repository and `LERP_SHARED_ROOT` containing root-site shared assets.
CI checks out both at explicit commits. `LERP_SCREENSHOTS` selects evidence output.

The stationary-target closed forms in `smoothing.js` are equivalent to repeated
updates. This avoids unbounded catch-up loops after long frames while preserving
the 10/30/60 Hz sample cadence. Inactive tabs pause the demo clock. Real repaint
rate limits displayed frames. Parameter changes restart both rows together.

## Research and deliberate changes

- [Unity Mathf.Lerp](https://docs.unity3d.com/6000.0/Documentation/ScriptReference/Mathf.Lerp.html)
  clamps its factor; it snaps at factors above 1. The original overshoot statement
  now distinguishes unclamped lerp.
- [Rory Driscoll](https://www.rorydriscoll.com/2016/03/07/frame-rate-independent-damping-using-lerp/)
  derives the equivalent power and exponential forms.
- [Ashley](https://www.construct.net/en/blogs/ashleys-blog-2/using-lerp-delta-time-924)
  distinguishes the useful delta-time approximation from exact exponential decay.
- [requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)
  uses timestamp-based animation and generally follows monitor refresh.

The two original rows remain. A selector now really demonstrates both methods;
half-life, pause/restart and remaining-distance values make the result measurable.
Fixed-factor tuning matches the selected half-life at 60 FPS. Euler uses the same
continuous decay rate, ln(2)/half-life. A compact sourced note separates exact
fixed-target partition independence from changing-target sampling and visible
low-FPS stepping. Half-life notation uses h, distinct from the decay constant λ.
The original article, author credits, C# examples and downloadable source remain,
apart from those narrow factual corrections. No converter is added.
