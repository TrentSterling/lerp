const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'discovery-manifest.json'), 'utf8'));
const hash = source => crypto.createHash('sha256').update(source).digest('hex');
const discoveryRegion = html.match(/<section class="tront-discovery"[\s\S]*?<\/section>/);
const aboutBlock = source => source.match(/<!-- tront-about:start -->([\s\S]*?)<!-- tront-about:end -->/);

test('Lerp opts in beside the protected About block and keeps direct links in markup', () => {
    assert.ok(discoveryRegion, 'missing discovery strip');
    assert.ok(html.indexOf('<!-- tront-about:end -->') < html.indexOf(discoveryRegion[0]));
    assert.match(html, /<link rel="stylesheet" href="tront-about-discovery\.css">/);
    assert.match(html, /<script src="tront-about-discovery\.js"><\/script>/);
    assert.match(discoveryRegion[0], /data-tront-discovery-cards/);
    assert.match(discoveryRegion[0], /data-tront-discovery-status role="status" aria-live="polite"/);
    assert.match(discoveryRegion[0], /<h2 id="lerp-discovery-title">More to play<\/h2>/);
    assert.match(discoveryRegion[0], /Open links directly or preview on hover, focus, or tap\./);
    assert.doesNotMatch(discoveryRegion[0], /tront-discovery__eyebrow|Featured game|Featured prototype|Quick pick/);
    assert.match(discoveryRegion[0], /href="\/craftmine\/"/);
    assert.match(discoveryRegion[0], /href="\/smear\/"/);
    assert.doesNotMatch(discoveryRegion[0], /\.mp4|<video\b/i, 'initial markup must not request previews');
});

test('vendored shared discovery assets match the pinned Lerp manifest', () => {
    const localJs = fs.readFileSync(path.join(root, manifest.localJavascriptPath), 'utf8');
    const localCss = fs.readFileSync(path.join(root, manifest.localCssPath), 'utf8');
    assert.equal(hash(localJs), manifest.localJavascriptSha256);
    assert.equal(hash(localCss), manifest.localCssSha256);
});

const shared = process.env.LERP_SHARED_ROOT;
test('vendored shared discovery assets match the pinned main-site source', { skip: !shared }, () => {
    const upstreamJsPath = path.join(shared, manifest.upstreamJavascriptPath);
    const upstreamCssPath = path.join(shared, manifest.upstreamCssPath);
    const upstreamJs = fs.readFileSync(upstreamJsPath, 'utf8');
    const upstreamCss = fs.readFileSync(upstreamCssPath, 'utf8');
    assert.equal(hash(upstreamJs), manifest.upstreamJavascriptSha256);
    assert.equal(hash(upstreamCss), manifest.upstreamCssSha256);
    assert.equal(fs.readFileSync(path.join(root, manifest.localJavascriptPath), 'utf8'), upstreamJs);
    assert.equal(fs.readFileSync(path.join(root, manifest.localCssPath), 'utf8'), upstreamCss);
});

const baseline = process.env.LERP_BASELINE_ROOT;
test('the original About block remains byte-for-byte unchanged', { skip: !baseline }, () => {
    const oldHtml = fs.readFileSync(path.join(baseline, 'index.html'), 'utf8');
    const before = aboutBlock(oldHtml);
    const after = aboutBlock(html);
    assert.ok(before && after, 'missing protected About markers');
    assert.equal(after[1], before[1]);
});
