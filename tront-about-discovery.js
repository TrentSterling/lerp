(function (root) {
    'use strict';
    if (!root || !root.document || root.TrontAboutDiscovery) return;

    var doc = root.document;
    var STORAGE_KEY = 'tront-about-discovery-session-v1';
    var FIXED_IDS = ['craftmine', 'smear'];
    var RANDOM_IDS = ['inkride', 'tinytreads', 'tinyrise'];
    var GAMES = [
        {
            id: 'craftmine', title: 'CraftMine', year: '2025', kind: 'Featured game',
            href: '/craftmine/', poster: '/games/media/craftmine-2025.webp?v=6548c556b7e9',
            preview: '/games/media/craftmine-2025.mp4?v=741b400e1a9b',
            description: 'AI-generated Minecraft clone with P2P multiplayer: 46 blocks, 36 mobs and 19 weapons. Runs in your browser.'
        },
        {
            id: 'smear', title: 'SMEAR', year: '2026', kind: 'Featured prototype',
            href: '/smear/', poster: '/games/media/smear-2026.webp?v=475c3f008f06',
            preview: '/games/media/smear-2026.mp4?v=687dcd477595',
            description: 'A physics playground for contact smears, wall splashes and dripping stains.',
            archivalNote: 'Archival V16 footage, sped up 2×. Current source is V47.1.'
        },
        {
            id: 'inkride', title: 'INKRIDE', year: '2026', kind: 'Quick pick',
            href: '/inkride/', poster: '/games/media/inkride-2026.webp?v=c70ac4423864',
            preview: '/games/media/inkride-2026.mp4?v=1590f82ebd34',
            description: 'Draw tracks in ink, ride them and crash beautifully in a shared physics sketchbook.'
        },
        {
            id: 'tinytreads', title: 'Tiny Treads', year: '2026', kind: 'Quick pick',
            href: '/tinytreads/', poster: '/games/media/tiny-treads-2026.webp?v=695d0c68976e',
            preview: '/games/media/tiny-treads-2026.mp4?v=754ee2ee465a',
            description: 'Turn-based artillery with destructible terrain and 400 wild weapons.'
        },
        {
            id: 'tinyrise', title: 'Tinyrise', year: '2026', kind: 'Quick pick',
            href: '/tinyrise/', poster: '/games/media/tinyrise-2026.webp?v=b27e4bc4479e',
            preview: '/games/media/tinyrise-2026.mp4?v=7c59e1b5395f',
            description: 'Build a city, then zoom in to follow one tiny life using its streets and stairs.'
        }
    ];
    var ALIASES = {
        craftmine: 'craftmine', 'craft-mine': 'craftmine',
        smear: 'smear',
        inkride: 'inkride', 'ink-ride': 'inkride',
        tinytreads: 'tinytreads', 'tiny-treads': 'tinytreads', 'tiny-tread': 'tinytreads',
        tinyrise: 'tinyrise', 'tiny-rise': 'tinyrise'
    };
    var memoryChoice = null;
    var sharedVideo = null;
    var activeCard = null;
    var activeGeneration = 0;
    var initialized = false;
    var visibilityObserver = null;
    var roots = [];

    function findGame(id) {
        for (var i = 0; i < GAMES.length; i += 1) if (GAMES[i].id === id) return GAMES[i];
        return null;
    }

    function canonicalGameId(value) {
        if (value == null) return null;
        var text = String(value).trim().toLowerCase();
        if (!text) return null;
        try {
            if (/^(https?:)?\/\//i.test(text)) text = new root.URL(text, root.location && root.location.href).pathname;
        } catch (_) { /* A route string still works if URL construction is unavailable. */ }
        text = text.replace(/[?#].*$/, '').replace(/\/+$/, '').replace(/\/index(?:\.html?)?$/, '');
        var parts = text.split('/').filter(Boolean);
        for (var i = parts.length - 1; i >= 0; i -= 1) {
            var token = parts[i].replace(/[^a-z0-9 -]/g, '').replace(/\s+/g, '-');
            if (ALIASES[token]) return ALIASES[token];
        }
        return null;
    }

    function currentGameFor(host) {
        var explicit = host && host.getAttribute && host.getAttribute('data-current-game');
        if (!explicit && doc.documentElement && doc.documentElement.getAttribute) {
            explicit = doc.documentElement.getAttribute('data-current-game') || doc.documentElement.getAttribute('data-tront-game');
        }
        var current = canonicalGameId(explicit);
        if (current) return current;
        var canonical = doc.querySelector && doc.querySelector('link[rel="canonical"]');
        return canonicalGameId(canonical && (canonical.href || canonical.getAttribute('href')) || (root.location && root.location.pathname));
    }

    function getStorage(options) {
        if (options && Object.prototype.hasOwnProperty.call(options, 'storage')) return options.storage;
        try { return root.sessionStorage; } catch (_) { return null; }
    }

    function safeRead(storage) {
        try { return storage && storage.getItem(STORAGE_KEY); } catch (_) { return null; }
    }

    function safeWrite(storage, value) {
        try { if (storage) storage.setItem(STORAGE_KEY, value); } catch (_) { /* The in-memory choice remains stable for this page. */ }
    }

    function isRandomId(id) {
        return RANDOM_IDS.indexOf(id) !== -1;
    }

    function stableSessionChoice(storage, random) {
        var saved = safeRead(storage);
        if (isRandomId(saved)) {
            memoryChoice = saved;
            return saved;
        }
        if (isRandomId(memoryChoice)) {
            safeWrite(storage, memoryChoice);
            return memoryChoice;
        }
        var roll = Number(random());
        if (!isFinite(roll)) roll = 0;
        roll = Math.max(0, Math.min(0.999999999, roll));
        var selected = RANDOM_IDS[Math.floor(roll * RANDOM_IDS.length)];
        memoryChoice = selected;
        safeWrite(storage, selected);
        return selected;
    }

    function selectAdditionalGame(currentGame, options) {
        options = options || {};
        var current = canonicalGameId(currentGame);
        var storage = getStorage(options);
        var random = typeof options.random === 'function' ? options.random : function () { return root.Math.random(); };
        var selected = stableSessionChoice(storage, random);
        if (selected !== current) return selected;

        // Keep the session's random pick stable on other pages. If this is the
        // current game, show the next eligible candidate without replacing it.
        var index = RANDOM_IDS.indexOf(selected);
        for (var offset = 1; offset < RANDOM_IDS.length; offset += 1) {
            var alternate = RANDOM_IDS[(index + offset) % RANDOM_IDS.length];
            if (alternate !== current) return alternate;
        }
        return null;
    }

    function selectGameIds(currentGame, options) {
        var current = canonicalGameId(currentGame);
        var ids = FIXED_IDS.filter(function (id) { return id !== current; });
        var additional = selectAdditionalGame(current, options);
        if (additional && ids.indexOf(additional) === -1) ids.push(additional);
        return ids;
    }

    function previewAllowed() {
        try {
            if (root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
        } catch (_) { /* Continue when matchMedia is unavailable. */ }
        try {
            return !(root.navigator && root.navigator.connection && root.navigator.connection.saveData);
        } catch (_) { return true; }
    }

    function cardIsVisible(card) {
        if (!card || doc.hidden) return false;
        var rect = card.getBoundingClientRect();
        var width = root.innerWidth || doc.documentElement.clientWidth || 0;
        var height = root.innerHeight || doc.documentElement.clientHeight || 0;
        return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < height && rect.right > 0 && rect.left < width;
    }

    function setStatus(host, message) {
        var status = host && host.querySelector && host.querySelector('[data-tront-discovery-status]');
        if (status) status.textContent = message;
    }

    function setButtonState(card, playing) {
        if (!card || !card._trontDiscoveryButton) return;
        var game = card._trontDiscoveryGame;
        var button = card._trontDiscoveryButton;
        button.textContent = playing ? 'Stop preview' : 'Preview';
        button.setAttribute('aria-label', playing
            ? 'Stop ' + game.title + ' preview'
            : (game.archivalNote ? 'Play archival preview of SMEAR V16 footage, sped up' : 'Play ' + game.title + ' preview'));
    }

    function getSharedVideo() {
        if (sharedVideo) return sharedVideo;
        sharedVideo = doc.createElement('video');
        sharedVideo.setAttribute('data-tront-discovery-video', '');
        sharedVideo.setAttribute('aria-hidden', 'true');
        sharedVideo.setAttribute('playsinline', '');
        sharedVideo.setAttribute('tabindex', '-1');
        sharedVideo.preload = 'none';
        sharedVideo.muted = true;
        sharedVideo.loop = true;
        sharedVideo.playsInline = true;
        sharedVideo.hidden = true;
        return sharedVideo;
    }

    function releaseCurrent(announce) {
        if (!activeCard) return;
        var previous = activeCard;
        activeCard = null;
        activeGeneration += 1;
        if (sharedVideo) {
            sharedVideo.onplaying = null;
            sharedVideo.onerror = null;
            try { sharedVideo.pause(); } catch (_) { /* The poster remains visible. */ }
            sharedVideo.hidden = true;
            sharedVideo.removeAttribute('src');
            try { sharedVideo.load(); } catch (_) { /* The source is already detached. */ }
        }
        setButtonState(previous, false);
        if (announce) setStatus(previous._trontDiscoveryHost, 'Preview stopped; the poster is still available.');
    }

    function failPreview(generation) {
        if (generation !== activeGeneration || !activeCard) return;
        var card = activeCard;
        var title = card._trontDiscoveryGame.title;
        releaseCurrent(false);
        setStatus(card._trontDiscoveryHost, 'The ' + title + ' preview could not play. The poster is still available; open the game to explore.');
    }

    function activate(card) {
        if (!card || !previewAllowed()) return false;
        if (!cardIsVisible(card)) return false;
        if (activeCard === card && sharedVideo && sharedVideo.getAttribute('src')) return true;
        var game = card._trontDiscoveryGame;
        if (!game || !game.preview || doc.hidden) return false;
        if (activeCard) releaseCurrent(false);

        var video = getSharedVideo();
        var media = card.querySelector('.tront-discovery__media');
        if (!media) return false;
        media.appendChild(video);
        activeCard = card;
        activeGeneration += 1;
        var generation = activeGeneration;
        video.hidden = true;
        video.onplaying = function () {
            if (generation !== activeGeneration || activeCard !== card) return;
            video.hidden = false;
            setStatus(card._trontDiscoveryHost, game.archivalNote
                ? 'Playing archival SMEAR V16 footage at 2× speed. Current source is V47.1.'
                : 'Playing ' + game.title + ' preview. Open the game link for the full experience.');
        };
        video.onerror = function () { failPreview(generation); };
        video.setAttribute('src', game.preview);
        video.setAttribute('data-tront-request', String(generation));
        video.load();
        setButtonState(card, true);
        setStatus(card._trontDiscoveryHost, game.archivalNote
            ? 'Loading archival SMEAR V16 footage at 2× speed; current source is V47.1.'
            : 'Loading ' + game.title + ' preview.');
        try {
            var playback = video.play();
            if (playback && typeof playback.catch === 'function') playback.catch(function () { failPreview(generation); });
        } catch (_) { failPreview(generation); }
        return true;
    }

    function createText(tag, className, text) {
        var element = doc.createElement(tag);
        if (className) element.className = className;
        if (text != null) element.textContent = text;
        return element;
    }

    function createCard(host, game) {
        var article = createText('article', 'tront-discovery__card');
        article.setAttribute('data-tront-discovery-game', game.id);
        var state = { hovered: false, focused: false };
        article._trontDiscoveryGame = game;
        article._trontDiscoveryHost = host;
        article._trontDiscoveryState = state;

        var media = createText('div', 'tront-discovery__media');
        var imageLink = doc.createElement('a');
        imageLink.className = 'tront-discovery__image-link';
        imageLink.href = game.href;
        imageLink.setAttribute('aria-label', 'Open ' + game.title + ' (' + game.year + ')');
        var image = doc.createElement('img');
        image.className = 'tront-discovery__poster';
        image.src = game.poster;
        image.alt = game.title + ' (' + game.year + ') gameplay poster';
        image.loading = 'lazy';
        image.decoding = 'async';
        image.width = 640;
        image.height = 360;
        imageLink.appendChild(image);
        media.appendChild(imageLink);

        var button = doc.createElement('button');
        button.type = 'button';
        button.className = 'tront-discovery__preview';
        button.textContent = 'Preview';
        button.setAttribute('aria-label', game.archivalNote
            ? 'Play archival preview of SMEAR V16 footage, sped up'
            : 'Play ' + game.title + ' preview');
        button.hidden = !previewAllowed();
        media.appendChild(button);
        article._trontDiscoveryButton = button;

        var content = createText('div', 'tront-discovery__content');
        var kind = createText('p', 'tront-discovery__kind', game.kind);
        content.appendChild(kind);
        var heading = doc.createElement('h3');
        heading.className = 'tront-discovery__title';
        var titleLink = doc.createElement('a');
        titleLink.href = game.href;
        titleLink.textContent = game.title + ' (' + game.year + ')';
        heading.appendChild(titleLink);
        content.appendChild(heading);
        content.appendChild(createText('p', 'tront-discovery__description', game.description));
        if (game.archivalNote) content.appendChild(createText('p', 'tront-discovery__archive-note', game.archivalNote));
        var openLink = doc.createElement('a');
        openLink.className = 'tront-discovery__open';
        openLink.href = game.href;
        openLink.textContent = 'Open ' + game.title;
        content.appendChild(openLink);
        article.appendChild(media);
        article.appendChild(content);

        button.addEventListener('click', function () {
            if (activeCard === article) releaseCurrent(true);
            else if (!activate(article) && !previewAllowed()) setStatus(host, 'Previews are off when reduced motion or Save-Data is enabled. The posters and game links still work.');
        });
        article.addEventListener('pointerenter', function (event) {
            if (event.pointerType === 'touch') return;
            state.hovered = true;
            if (!activate(article) && !previewAllowed()) setStatus(host, 'Previews are off when reduced motion or Save-Data is enabled. The posters and game links still work.');
        });
        article.addEventListener('pointerleave', function (event) {
            if (event.pointerType === 'touch') return;
            state.hovered = false;
            if (!state.focused && activeCard === article) releaseCurrent(false);
        });
        article.addEventListener('focusin', function (event) {
            var focusVisible = false;
            try { focusVisible = event.target.matches && event.target.matches(':focus-visible'); } catch (_) { /* Keyboard modality remains the fallback. */ }
            if (!focusVisible) return;
            state.focused = true;
            if (!activate(article) && !previewAllowed()) setStatus(host, 'Previews are off when reduced motion or Save-Data is enabled. The posters and game links still work.');
        });
        article.addEventListener('focusout', function (event) {
            if (event.relatedTarget && article.contains(event.relatedTarget)) return;
            state.focused = false;
            if (!state.hovered && activeCard === article) releaseCurrent(false);
        });
        return article;
    }

    function updateRootsForMotion() {
        var allowed = previewAllowed();
        for (var i = 0; i < roots.length; i += 1) {
            var buttons = roots[i].querySelectorAll('.tront-discovery__preview');
            for (var j = 0; j < buttons.length; j += 1) buttons[j].hidden = !allowed;
            if (!allowed) setStatus(roots[i], 'Previews are off when reduced motion or Save-Data is enabled. The posters and game links still work.');
        }
        if (!allowed) releaseCurrent(false);
    }

    function disclosureChain(host) {
        var chain = [];
        for (var parent = host && host.parentElement; parent; parent = parent.parentElement) {
            if (parent.tagName && String(parent.tagName).toLowerCase() === 'details') chain.push(parent);
        }
        return chain;
    }

    function disclosuresAreOpen(chain) {
        for (var i = 0; i < chain.length; i += 1) if (!chain[i].open) return false;
        return true;
    }

    function watchDisclosures(host, chain) {
        var watched = host._trontDiscoveryWatchedDetails || (host._trontDiscoveryWatchedDetails = []);
        for (var i = 0; i < chain.length; i += 1) {
            var disclosure = chain[i];
            if (watched.indexOf(disclosure) !== -1) continue;
            watched.push(disclosure);
            disclosure.addEventListener('toggle', function () {
                var currentChain = disclosureChain(host);
                if (!disclosuresAreOpen(currentChain)) {
                    if (activeCard && host.contains(activeCard)) releaseCurrent(false);
                    return;
                }
                setupHost(host);
            });
        }
    }

    function setupHost(host) {
        if (!host || host._trontDiscoveryReady) return;
        var grid = host.querySelector('[data-tront-discovery-cards]');
        if (!grid) return;
        var chain = disclosureChain(host);
        watchDisclosures(host, chain);
        if (!disclosuresAreOpen(chain)) return;
        host._trontDiscoveryReady = true;
        var selected = selectGameIds(currentGameFor(host), {storage: getStorage()});
        while (grid.firstChild) grid.removeChild(grid.firstChild);
        for (var i = 0; i < selected.length; i += 1) {
            var game = findGame(selected[i]);
            if (!game) continue;
            var card = createCard(host, game);
            grid.appendChild(card);
            if (visibilityObserver) visibilityObserver.observe(card);
        }
        roots.push(host);
        setStatus(host, 'Hover or focus a card to preview it. Open links work independently.');
    }

    function start() {
        if (initialized) return;
        initialized = true;
        if (typeof root.IntersectionObserver === 'function') {
            visibilityObserver = new root.IntersectionObserver(function (entries) {
                entries.forEach(function (entry) {
                    var card = entry.target;
                    var state = card._trontDiscoveryState;
                    if (!entry.isIntersecting || entry.intersectionRatio <= 0) {
                        if (activeCard === card) releaseCurrent(false);
                    } else if (state && (state.hovered || state.focused)) activate(card);
                });
            }, { root: null, threshold: 0 });
        }
        var hosts = doc.querySelectorAll('[data-tront-discovery]');
        for (var i = 0; i < hosts.length; i += 1) setupHost(hosts[i]);
        doc.addEventListener('visibilitychange', function () { if (doc.hidden) releaseCurrent(false); });
        try {
            var motion = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)');
            if (motion && motion.addEventListener) motion.addEventListener('change', updateRootsForMotion);
            else if (motion && motion.addListener) motion.addListener(updateRootsForMotion);
            var connection = root.navigator && root.navigator.connection;
            if (connection && connection.addEventListener) connection.addEventListener('change', updateRootsForMotion);
        } catch (_) { /* Preferences are checked again whenever a preview is requested. */ }
        updateRootsForMotion();
    }

    var api = {
        version: 1,
        canonicalGameId: canonicalGameId,
        currentGameFor: currentGameFor,
        selectAdditionalGame: selectAdditionalGame,
        selectGameIds: selectGameIds,
        catalog: GAMES.map(function (game) { return Object.assign({}, game); })
    };
    root.TrontAboutDiscovery = api;
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start, {once: true});
    else start();
})(window);
