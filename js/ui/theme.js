/*
  theme.js
  Multi-theme selector.
  Replaces the old dark/light toggle with a palette picker
  that supports all themes defined in css/themes.css.
*/

var THEMES = [
    { id: 'neon',      label: 'Neon',      accent: '#00d4ff', bg: '#060d1b' },
    { id: 'classic',   label: 'Classic',   accent: '#f59e0b', bg: '#0c0c0c' },
    { id: 'retro',     label: 'Retro',     accent: '#e05c25', bg: '#1c0f07' },
    { id: 'mono',      label: 'Mono',      accent: '#e0e0e0', bg: '#080808' },
    { id: 'synthwave', label: 'Synthwave', accent: '#ff2d78', bg: '#0d0014' },
];

var DEFAULT_THEME = 'neon';

/* ── Apply a theme by id ──────────────────────────────── */
function applyTheme(id) {
    document.documentElement.setAttribute('data-theme', id);
    localStorage.setItem('theme', id);

    document.querySelectorAll('.theme-swatch').forEach(function (el) {
        var active = el.dataset.theme === id;
        el.classList.toggle('active', active);
        el.setAttribute('aria-pressed', active);
    });
}

/* ── Resolve saved theme, migrate old dark/light names ─ */
function resolveTheme() {
    var saved = localStorage.getItem('theme');
    if (!saved || saved === 'dark' || saved === 'light' ||
        !THEMES.find(function (t) { return t.id === saved; })) {
        saved = DEFAULT_THEME;
        localStorage.setItem('theme', saved);
    }
    return saved;
}

/* ── Build the picker panel and wire up the toggle btn ─ */
function buildPicker() {
    var toggle = document.getElementById('theme-toggle');
    if (!toggle) return;

    /* Swap icon to a palette shape */
    toggle.innerHTML =
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" ' +
        'stroke="currentColor" stroke-width="2.5" stroke-linecap="round">' +
        '<circle cx="13.5" cy="6.5" r="1.5"/>' +
        '<circle cx="17.5" cy="10.5" r="1.5"/>' +
        '<circle cx="8.5" cy="7.5" r="1.5"/>' +
        '<circle cx="6.5" cy="12.5" r="1.5"/>' +
        '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10c.93 0 1.65-.75 ' +
        '1.65-1.69 0-.44-.18-.84-.44-1.13-.29-.29-.44-.65-.44-1.13a1.64 ' +
        '1.64 0 0 1 1.67-1.67H16c3.05 0 5.5-2.46 5.5-5.5C21.5 6.23 ' +
        '17.24 2 12 2z"/></svg>';
    toggle.setAttribute('aria-label', 'Change theme');
    toggle.setAttribute('aria-haspopup', 'true');
    toggle.setAttribute('aria-expanded', 'false');

    /* Build panel */
    var panel = document.createElement('div');
    panel.className = 'theme-panel';
    panel.id = 'theme-panel';
    panel.hidden = true;
    panel.setAttribute('role', 'menu');
    panel.setAttribute('aria-label', 'Choose theme');

    var list = document.createElement('div');
    list.className = 'theme-swatches';

    var current = document.documentElement.getAttribute('data-theme') || DEFAULT_THEME;

    THEMES.forEach(function (t) {
        var btn = document.createElement('button');
        btn.className = 'theme-swatch' + (t.id === current ? ' active' : '');
        btn.dataset.theme = t.id;
        btn.setAttribute('role', 'menuitemradio');
        btn.setAttribute('aria-pressed', t.id === current);
        btn.title = t.label;
        btn.innerHTML =
            '<span class="swatch-dot" style="background:' + t.accent +
            ';box-shadow:0 0 6px ' + t.accent + '44"></span>' +
            '<span class="swatch-label">' + t.label + '</span>';

        btn.addEventListener('click', function () {
            applyTheme(t.id);
            closePanel();
        });

        list.appendChild(btn);
    });

    panel.appendChild(list);
    toggle.parentElement.appendChild(panel);

    /* Toggle open/close */
    toggle.addEventListener('click', function () {
        var open = !panel.hidden;
        panel.hidden = open;
        toggle.setAttribute('aria-expanded', !open);
    });

    /* Close on outside click */
    document.addEventListener('click', function (e) {
        if (!panel.hidden &&
            !toggle.contains(e.target) &&
            !panel.contains(e.target)) {
            closePanel();
        }
    });

    /* Close on Escape */
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && !panel.hidden) closePanel();
    });

    function closePanel() {
        panel.hidden = true;
        toggle.setAttribute('aria-expanded', 'false');
    }
}

/* ── Init ─────────────────────────────────────────────── */
/* Apply theme immediately (before DOMContentLoaded) to prevent FOUC */
applyTheme(resolveTheme());

document.addEventListener('DOMContentLoaded', buildPicker);
