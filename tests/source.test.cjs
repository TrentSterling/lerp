const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const baseline = process.env.LERP_BASELINE_ROOT;
test('exact shipped root assets, local page adapter and six-simulation contract', () => {
    for (const file of ['/assets/js/tront-system.js', 'lerp-editor.js', '/assets/css/tront-theme-editor.css', '/assets/css/tront-navbar.css']) assert.ok(html.includes(file));
    assert.match(html, /data-tront-theme-surface="lerp"/);
    assert.match(html, /id="bad-sims"/); assert.match(html, /id="good-sims"/);
    assert.match(html, /id="comparison"/); assert.match(html, /id="half-life"/);
    assert.match(html, /Mathf.Lerp clamps the factor/);
    assert.ok(!html.includes('perfectly synchronized across all framerates'));
    assert.ok(!html.includes('This demo represents the result of both naive approaches'));
});
test('original C# download and article outside narrow factual corrections are preserved', { skip: !baseline }, () => {
    assert.deepEqual(fs.readFileSync(path.join(root, 'SmoothingExtensions.cs')), fs.readFileSync(path.join(baseline, 'SmoothingExtensions.cs')));
    const old = fs.readFileSync(path.join(baseline, 'index.html'), 'utf8');
    const article = /<div class="explanation-box">([\s\S]*?)\n        <\/div>/;
    const paragraphs = old.match(article)[1].match(/<p>[\s\S]*?<\/p>/g);
    for (const p of paragraphs) {
        if (p.includes('<strong>The Second Mistake:')) continue;
        assert.ok(html.includes(p.replace('"half-life" (λ)', '"half-life" (h)')), p.slice(0, 100));
    }
    const normalizedHtml = html.replace(/\r\n?/g, '\n');
    for (const code of old.matchAll(/<pre><code>([\s\S]*?)<\/code><\/pre>/g)) assert.ok(normalizedHtml.includes(code[0].replace(/\r\n?/g, '\n')));
    const beforeAbout = old.match(/<!-- tront-about:start -->([\s\S]*?)<!-- tront-about:end -->/);
    const afterAbout = html.match(/<!-- tront-about:start -->([\s\S]*?)<!-- tront-about:end -->/);
    assert.ok(beforeAbout && afterAbout, 'About markers remain around the redesigned footer area');
    const oldJsonLd = beforeAbout[1].match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    const newJsonLd = afterAbout[1].match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    assert.ok(oldJsonLd && newJsonLd, 'About structured data remains present');
    assert.equal(newJsonLd[1], oldJsonLd[1], 'About structured data remains unchanged');
});
