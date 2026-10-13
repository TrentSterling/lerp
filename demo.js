(function () {
    'use strict';
    var M = window.LerpMath;
    var halfLife = 0.3, method = 'fixed', elapsed = 0, lastTimestamp = null;
    var pauseButton = document.getElementById('pause-demo');
    var motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    var paused = motionPreference.matches;
    var status = document.getElementById('demo-status');
    var simulations = [];
    var palette = {};
    function readPalette() {
        var css = getComputedStyle(document.documentElement);
        palette.target = css.getPropertyValue('--accent-teal').trim() || '#2ee6d7';
        palette.bad = css.getPropertyValue('--status-dnd').trim() || '#f23f43';
        palette.good = css.getPropertyValue('--status-online').trim() || '#23a55a';
    }
    function create(fps, bad) {
        var wrapper = document.createElement('div'); wrapper.className = 'sim-wrapper';
        var label = document.createElement('p'); label.textContent = fps + ' FPS';
        var canvas = document.createElement('canvas'); canvas.width = 300; canvas.height = 80;
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', (bad ? 'Comparison' : 'Exponential smoothing') + ' at ' + fps + ' FPS. A square approaches the target line.');
        var output = document.createElement('output'); output.className = 'sim-readout';
        output.setAttribute('aria-label', 'Distance remaining at ' + fps + ' FPS');
        wrapper.append(label, canvas, output);
        document.getElementById(bad ? 'bad-sims' : 'good-sims').appendChild(wrapper);
        simulations.push({ fps: fps, bad: bad, canvas: canvas, ctx: canvas.getContext('2d'), output: output });
    }
    [10, 30, 60].forEach(function (fps) { create(fps, true); });
    [10, 30, 60].forEach(function (fps) { create(fps, false); });
    function draw() {
        simulations.forEach(function (sim) {
            var sample = M.sampleAt(elapsed, sim.fps, halfLife, sim.bad ? method : 'exponential');
            var ctx = sim.ctx;
            ctx.clearRect(0, 0, 300, 80); ctx.strokeStyle = palette.target; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(M.TARGET, 0); ctx.lineTo(M.TARGET, 80); ctx.stroke();
            ctx.fillStyle = sim.bad ? palette.bad : palette.good;
            ctx.fillRect(sample.x, 25, 30, 30);
            sim.canvas.dataset.position = sample.x.toFixed(8);
            sim.canvas.dataset.sampleTime = sample.sampleTime.toFixed(8);
            sim.output.textContent = (sample.remaining * 100).toFixed(1) + '% remaining';
        });
    }
    function syncControls() {
        pauseButton.textContent = paused ? 'Play' : 'Pause';
        pauseButton.setAttribute('aria-pressed', String(paused));
        document.getElementById('half-life-value').textContent = halfLife.toFixed(2) + ' s';
        document.getElementById('comparison-heading').innerHTML = method === 'fixed'
            ? 'Fixed factor: <code>a = lerp(a, b, constant)</code>'
            : 'Delta-time approximation: <code>a = lerp(a, b, rate * dt)</code>';
        document.getElementById('comparison-note').textContent = method === 'fixed'
            ? 'A fixed factor is applied once per simulated frame. More frames means faster convergence.'
            : 'The factor is clamped to [0, 1], like Unity Mathf.Lerp. This approximation still changes with the timestep.';
        var rate = Math.LN2 / halfLife, factor = M.halfLifeAlpha(halfLife, 1 / 60);
        document.getElementById('rate-note').textContent = method === 'fixed'
            ? 'Factor ' + factor.toFixed(4) + ' matches a ' + halfLife.toFixed(2) + ' s half-life at 60 FPS. Both rows repeat every 3 seconds.'
            : 'Rate ' + rate.toFixed(3) + ' per second comes from ln(2) / half-life. The exact exponential row uses the same rate.';
    }
    function restart() { elapsed = 0; lastTimestamp = null; draw(); }
    document.getElementById('half-life').addEventListener('input', function (event) {
        halfLife = Number(event.target.value); syncControls(); restart();
    });
    document.getElementById('comparison').addEventListener('change', function (event) {
        method = event.target.value; syncControls(); restart();
    });
    pauseButton.addEventListener('click', function () {
        paused = !paused; lastTimestamp = null; syncControls();
        status.textContent = paused ? 'Demo paused.' : 'Demo playing.';
    });
    document.getElementById('restart-demo').addEventListener('click', function () { restart(); status.textContent = 'Demo restarted.'; });
    document.addEventListener('visibilitychange', function () { lastTimestamp = null; });
    motionPreference.addEventListener('change', function (event) {
        if (event.matches) { paused = true; lastTimestamp = null; syncControls(); status.textContent = 'Demo paused for reduced motion.'; }
    });
    function tick(timestamp) {
        if (!paused && !document.hidden && lastTimestamp !== null) elapsed = M.advance(elapsed, Math.max(0, (timestamp - lastTimestamp) / 1000));
        lastTimestamp = paused || document.hidden ? null : timestamp;
        draw(); requestAnimationFrame(tick);
    }
    readPalette(); syncControls(); draw();
    new MutationObserver(function () { readPalette(); draw(); }).observe(document.documentElement, {
        attributes: true, attributeFilter: ['style', 'data-lerp-palette', 'data-te-mode']
    });
    requestAnimationFrame(tick);
})();
