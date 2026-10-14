const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'discovery-manifest.json'), 'utf8'));
const hash = source => crypto.createHash('sha256').update(source).digest('hex');
const aboutBlock = source => source.match(/<!-- tront-about:start -->([\s\S]*?)<!-- tront-about:end -->/);
const discoveryRegion = html.match(/<section class="tront-discovery[^\"]*"[^>]*data-tront-discovery[\s\S]*?<\/section>/);
function visibleText(source) {
    return source.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&#96;/gi, '`').replace(/&middot;/gi, ' � ').replace(/&amp;/gi, '&')
        .replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
}
function links(source) {
    return [...source.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)]
        .map(match => ({href: match[1], text: visibleText(match[2])}));
}

test('Lerp combines the About content and game discovery in one semantic footer area', () => {
    assert.ok(discoveryRegion, 'missing About and discovery section');
    assert.equal((html.match(/data-tront-discovery(?:\s|>)/g) || []).length, 1, 'expected one discovery host');
    assert.match(discoveryRegion[0], /<h2 id="lerp-about-title">About Tront<\/h2>/);
    assert.match(discoveryRegion[0], /<h3>More from Tront<\/h3>/);
    assert.match(discoveryRegion[0], /<h3 class="tront-discovery__games-title">Games<\/h3>/);
    assert.match(discoveryRegion[0], /data-tront-discovery-cards/);
    assert.match(discoveryRegion[0], /data-tront-discovery-status role="status" aria-live="polite"/);
    assert.match(discoveryRegion[0], /href="\/craftmine\/"/);
    assert.match(discoveryRegion[0], /href="\/smear\/"/);
    assert.doesNotMatch(html, /class="tront-about"|About\s*&middot;\s*More by Tront|More to play/i);
    assert.doesNotMatch(discoveryRegion[0], /\.mp4|<video\b|archive|earlier build|V16 footage/i);
    assert.doesNotMatch(discoveryRegion[0], /Featured game|Featured prototype|Quick pick|Open links directly/i);
    assert.match(html, /<link rel="stylesheet" href="tront-about-discovery\.css">/);
    assert.match(html, /<script src="tront-about-discovery\.js"><\/script>/);
});

test('the redesigned wrapper preserves both original bio paragraphs and every meaningful link', {skip: !process.env.LERP_BASELINE_ROOT}, () => {
    const oldHtml = fs.readFileSync(path.join(process.env.LERP_BASELINE_ROOT, 'index.html'), 'utf8');
    const before = aboutBlock(oldHtml);
    const after = aboutBlock(html);
    assert.ok(before && after, 'missing About markers');
    const oldParas = [...before[1].matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
        .map(match => visibleText(match[1])).filter(text => text.startsWith('A demo of a bug') || text.startsWith('One page, no install.'));
    const newText = visibleText(after[1]);
    assert.equal(oldParas.length, 2, 'baseline biography paragraphs should be found');
    for (const paragraph of oldParas) assert.ok(newText.includes(paragraph), 'bio paragraph changed: ' + paragraph);
    const newLinks = links(after[1]);
    for (const oldLink of links(before[1])) {
        assert.ok(newLinks.some(link => link.href === oldLink.href && link.text === oldLink.text), 'missing preserved link: ' + oldLink.href);
    }
    const oldJsonLd = before[1].match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    const newJsonLd = after[1].match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    assert.ok(oldJsonLd && newJsonLd, 'structured data should remain in the About area');
    assert.equal(newJsonLd[1], oldJsonLd[1], 'structured data changed');
});

test('vendored shared discovery assets match the pinned Lerp manifest', () => {
    const localJs = fs.readFileSync(path.join(root, manifest.localJavascriptPath), 'utf8');
    const localCss = fs.readFileSync(path.join(root, manifest.localCssPath), 'utf8');
    assert.equal(hash(localJs), manifest.localJavascriptSha256);
    assert.equal(hash(localCss), manifest.localCssSha256);
});

const shared = process.env.LERP_SHARED_ROOT;
test('vendored shared discovery assets match the pinned main-site source', {skip: !shared}, () => {
    const upstreamJsPath = path.join(shared, manifest.upstreamJavascriptPath);
    const upstreamCssPath = path.join(shared, manifest.upstreamCssPath);
    const upstreamJs = fs.readFileSync(upstreamJsPath, 'utf8');
    const upstreamCss = fs.readFileSync(upstreamCssPath, 'utf8');
    assert.equal(hash(upstreamJs), manifest.upstreamJavascriptSha256);
    assert.equal(hash(upstreamCss), manifest.upstreamCssSha256);
    assert.equal(fs.readFileSync(path.join(root, manifest.localJavascriptPath), 'utf8'), upstreamJs);
    assert.equal(fs.readFileSync(path.join(root, manifest.localCssPath), 'utf8'), upstreamCss);
});
