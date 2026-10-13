/* Page adapter only. Shared ColorMagic assets stay on the released engine.
 * Midnight/Reset restores this demo's original purple/teal composition.
 * Compare public generated tokens rather than storage: denied storage still works.
 */
(function () {
    'use strict';
    var editor = window.TrontThemeEditor;
    if (!editor) return;
    var html = document.documentElement;
    var original = editor.buildTokens(editor.preset('dark')).vars;
    function sync() {
        var native = Object.keys(original).every(function (key) {
            return html.style.getPropertyValue(key) === original[key];
        });
        html.setAttribute('data-lerp-palette', native ? 'original' : 'custom');
    }
    sync();
    new MutationObserver(sync).observe(html, { attributes: true, attributeFilter: ['style', 'data-te-mode'] });
})();
