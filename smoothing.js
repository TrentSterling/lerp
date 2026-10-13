/* Deterministic stationary-target math, shared by the demo and Node tests. */
(function (root, factory) {
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.LerpMath = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';
    var START = 20, TARGET = 250, DURATION = 3, REFERENCE_FPS = 60;
    function halfLifeAlpha(halfLife, dt) {
        if (!Number.isFinite(halfLife) || halfLife <= 0) throw new RangeError('halfLife must be positive and finite');
        if (!Number.isFinite(dt) || dt < 0) throw new RangeError('dt must be non-negative and finite');
        return -Math.expm1(-Math.LN2 * dt / halfLife);
    }
    function sampleAt(time, fps, halfLife, method) {
        if (!Number.isFinite(time) || time < 0 || !Number.isFinite(fps) || fps <= 0) throw new RangeError('Invalid sample time or FPS');
        // A tiny tolerance prevents 0.3 * 10 being rounded just below a boundary.
        var steps = Math.floor(time * fps + 1e-9);
        var alpha = halfLifeAlpha(halfLife, 1 / fps);
        if (method === 'fixed') alpha = halfLifeAlpha(halfLife, 1 / REFERENCE_FPS);
        else if (method === 'scaled') alpha = Math.min(1, Math.LN2 / halfLife / fps);
        else if (method !== 'exponential') throw new RangeError('Unknown smoothing method');
        var remaining = Math.pow(1 - alpha, steps);
        return { x: TARGET - (TARGET - START) * remaining, remaining: remaining, steps: steps, sampleTime: steps / fps };
    }
    function advance(time, dt) {
        if (!Number.isFinite(time) || time < 0 || !Number.isFinite(dt) || dt < 0) throw new RangeError('Invalid clock');
        return (time + dt) % DURATION;
    }
    return { START: START, TARGET: TARGET, DURATION: DURATION, REFERENCE_FPS: REFERENCE_FPS,
        halfLifeAlpha: halfLifeAlpha, sampleAt: sampleAt, advance: advance };
});
