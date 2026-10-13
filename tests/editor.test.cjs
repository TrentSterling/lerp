const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const upstream = fs.readFileSync(path.join(__dirname, 'fixtures/tront-theme-editor.upstream.js.txt'), 'utf8');
const local = fs.readFileSync(path.join(root, 'lerp-editor.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'vendor-manifest.json')));
const hash = s => crypto.createHash('sha256').update(s).digest('hex');
test('local editor provenance matches the pinned upstream and documented derivative', () => {
    assert.equal(hash(upstream), manifest.upstreamSha256);
    assert.equal(hash(local), manifest.localSha256);
    const range = (s, from, to) => s.slice(s.indexOf(from), s.indexOf(to));
    assert.equal(range(local, '    function buildTokens', '    root.TrontThemeEditor'), range(upstream, '    function buildTokens', '    root.TrontThemeEditor'));
    assert.equal(range(local, '        var dialogSessionOpen', '        var backdropDown'), range(upstream, '        var dialogSessionOpen', '        var backdropDown'));
    assert.match(local, /var KEY = 'tront-theme-lerp-v1'/);
    assert.ok(!local.includes("localStorage.getItem('tront-theme')"));
});
const shared = process.env.LERP_SHARED_ROOT;
test('all shared palette tokens stay identical to the released engine', {skip:!shared}, () => {
    const system = fs.readFileSync(path.join(shared, 'assets/js/tront-system.js'), 'utf8');
    if (fs.existsSync(path.join(shared,'assets/js/tront-theme-editor.js'))) assert.equal(fs.readFileSync(path.join(shared,'assets/js/tront-theme-editor.js'),'utf8'),upstream);
    function load(source) {
        const window = {document:{documentElement:{getAttribute:()=>'lerp',hasAttribute:()=>false}}};
        const context=vm.createContext({window});vm.runInContext(system,context);vm.runInContext(source,context);return window.TrontThemeEditor;
    }
    const a=load(upstream),b=load(local),plain=o=>JSON.parse(JSON.stringify(o));
    for(const preset of a.presets)for(const mode of ['dark','light'])for(const intensity of [0,65,100])for(const frost of [75,88,100]){
        const state={...a.preset(preset.id),mode,intensity,frost};
        assert.deepEqual(plain(a.buildTokens(state)),plain(b.buildTokens(state)));
    }
    const original=b.normalize({preset:'lerp-original'});
    assert.deepEqual(plain(original.pegs.map(p=>p.color)),['#a855f7','#2ee6d7','#f23f43','#23a55a']);
});
