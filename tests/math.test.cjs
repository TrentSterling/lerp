const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../smoothing.js');
const close = (a, b, tolerance = 1e-10) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);

test('half-life halves the remaining distance and zero dt does nothing', () => {
    close(M.halfLifeAlpha(0.3, 0.3), 0.5);
    assert.equal(M.halfLifeAlpha(0.3, 0), 0);
});
test('fixed-target exponential damping composes across irregular partitions', () => {
    for (const h of [0.05, 0.3, 1]) for (const intervals of [[0.1, 0.2], [0.001, 0.249, 0.05], [0.06, 0.09, 0.15]]) {
        const remaining = intervals.reduce((r, dt) => r * (1 - M.halfLifeAlpha(h, dt)), 1);
        close(remaining, 1 - M.halfLifeAlpha(h, intervals.reduce((a, b) => a + b, 0)));
    }
});
test('all three exponential simulations agree at common sample times', () => {
    for (const h of [0.05, 0.3, 1]) for (const t of [0, 0.1, 0.3, 0.5, 1, 2.9]) {
        const values = [10, 30, 60].map(fps => M.sampleAt(t, fps, h, 'exponential'));
        values.forEach(v => close(v.x, values[0].x));
        close(values[0].remaining, Math.pow(2, -t / h));
    }
});
test('a fixed factor is matched at 60 FPS and is slower at lower rates', () => {
    for (const h of [0.05, 0.3, 1]) {
        close(M.sampleAt(0.5, 60, h, 'fixed').x, M.sampleAt(0.5, 60, h, 'exponential').x);
        assert.ok(M.sampleAt(0.5, 10, h, 'fixed').x < M.sampleAt(0.5, 30, h, 'fixed').x);
    }
});
test('delta-time approximation differs by update rate and clamps instead of overshooting', () => {
    assert.notEqual(M.sampleAt(0.5, 10, 0.3, 'scaled').x, M.sampleAt(0.5, 60, 0.3, 'scaled').x);
    assert.equal(M.sampleAt(0.1, 10, 0.05, 'scaled').x, M.TARGET);
    for (const h of [0.05, 0.3, 1]) for (const fps of [10, 30, 60]) for (const method of ['fixed', 'scaled', 'exponential']) {
        const v = M.sampleAt(2.9, fps, h, method);
        assert.ok(v.x >= M.START && v.x <= M.TARGET);
    }
});
test('discrete sampling is honest between shared sample times', () => {
    assert.equal(M.sampleAt(0.09, 10, 0.3, 'exponential').steps, 0);
    assert.equal(M.sampleAt(0.1, 10, 0.3, 'exponential').steps, 1);
    assert.equal(M.sampleAt(0.19, 10, 0.3, 'exponential').steps, 1);
});
test('cycle wrap retains excess elapsed time without an unbounded catch-up loop', () => {
    close(M.advance(2.9, 0.3), 0.2);
    close(M.advance(0.1, 3600.2), 0.3, 1e-9);
});
test('invalid math parameters fail explicitly', () => {
    for (const h of [0, -1, Infinity, NaN]) assert.throws(() => M.halfLifeAlpha(h, 0.1), RangeError);
    for (const dt of [-1, Infinity, NaN]) assert.throws(() => M.halfLifeAlpha(0.3, dt), RangeError);
});
