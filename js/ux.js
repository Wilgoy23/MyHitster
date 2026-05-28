/*
 ux.js
 Progressive-disclosure UX enhancements for card-generator.html.
 No dependencies on card-generator.js internals — purely DOM-driven.
*/

document.addEventListener('DOMContentLoaded', () => {
    initImportTabs();
    initUrlValidation();
    initYearValidation();
    initLoadingProgress();
});

// ── Import source tabs ────────────────────────────────────────────────────────

function initImportTabs() {
    const tabs   = document.querySelectorAll('.import-tab');
    const panels = document.querySelectorAll('.import-panel');
    if (!tabs.length) return;

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const target = tab.dataset.import;

            tabs.forEach(t => t.classList.toggle('active', t === tab));
            panels.forEach(p => {
                const active = p.id === `import-panel-${target}`;
                p.classList.toggle('active', active);
            });
        });
    });
}

// ── Deezer URL inline validation ─────────────────────────────────────────────

function initUrlValidation() {
    const input    = document.getElementById('playlist-url-input');
    const feedback = document.getElementById('url-input-feedback');
    if (!input || !feedback) return;

    const DEEZER_RE = /deezer\.com\/([\w-]+\/)?playlist\/\d+/;

    input.addEventListener('input', () => {
        const val = input.value.trim();
        if (!val) { feedback.textContent = ''; feedback.className = 'url-feedback'; return; }

        if (DEEZER_RE.test(val)) {
            feedback.textContent = '✓ Deezer playlist URL recognised';
            feedback.className   = 'url-feedback ok';
        } else if (val.includes('deezer.com')) {
            feedback.textContent = 'Paste a playlist URL — e.g. deezer.com/playlist/12345';
            feedback.className   = 'url-feedback warn';
        } else {
            feedback.textContent = 'Only public Deezer playlists are supported';
            feedback.className   = 'url-feedback err';
        }
    });
}

// ── Year range cross-validation ───────────────────────────────────────────────

function initYearValidation() {
    const minEl    = document.getElementById('min-year');
    const maxEl    = document.getElementById('max-year');
    const feedback = document.getElementById('year-range-feedback');
    if (!minEl || !maxEl || !feedback) return;

    function validate() {
        const min = parseInt(minEl.value, 10);
        const max = parseInt(maxEl.value, 10);
        if (!minEl.value && !maxEl.value) { feedback.textContent = ''; feedback.className = 'url-feedback'; return; }

        if (minEl.value && maxEl.value && min > max) {
            feedback.textContent = 'Min year must be less than max year';
            feedback.className   = 'url-feedback err';
        } else if (min < 1900 || max > new Date().getFullYear() + 1) {
            feedback.textContent = 'Year looks out of range';
            feedback.className   = 'url-feedback warn';
        } else {
            feedback.textContent = '';
            feedback.className   = 'url-feedback';
        }
    }

    minEl.addEventListener('input', validate);
    maxEl.addEventListener('input', validate);
}

// ── Loading progress bar ──────────────────────────────────────────────────────
// Watches #loading-message text changes via MutationObserver to drive a
// pseudo-progress bar without touching card-generator.js internals.

function initLoadingProgress() {
    const msgEl = document.getElementById('loading-message');
    const bar   = document.getElementById('loading-bar');
    const wrap  = document.getElementById('loading-progress-wrap');
    if (!msgEl || !bar || !wrap) return;

    // Messages emitted by card-generator.js during a batch search
    const STEPS = [
        { pattern: /fetch|import|playlist/i,  pct: 10 },
        { pattern: /searching|looking up/i,   pct: 30 },
        { pattern: /\d+\s*\/\s*\d+/,          pct: null }, // live fraction
        { pattern: /verif/i,                   pct: 75 },
        { pattern: /done|complete|finish/i,    pct: 100 },
    ];

    let currentPct = 0;
    let animFrame  = null;

    function setProgress(pct) {
        currentPct = Math.max(currentPct, Math.min(pct, 100));
        bar.style.width = currentPct + '%';
    }

    function inferProgress(text) {
        // "12 / 40" style — compute actual fraction
        const frac = text.match(/(\d+)\s*\/\s*(\d+)/);
        if (frac) {
            const done  = parseInt(frac[1], 10);
            const total = parseInt(frac[2], 10);
            if (total > 0) {
                setProgress(30 + Math.round((done / total) * 45));
                return;
            }
        }
        for (const step of STEPS) {
            if (step.pct !== null && step.pattern.test(text)) {
                setProgress(step.pct);
                return;
            }
        }
    }

    // Watch loading section visibility
    const sectionObserver = new MutationObserver(() => {
        const section = document.getElementById('loading-section');
        if (!section) return;
        const visible = section.style.display !== 'none';
        if (visible) {
            currentPct = 0;
            bar.style.transition = 'none';
            bar.style.width = '0%';
            // force reflow then re-enable transition
            bar.offsetWidth; // eslint-disable-line no-unused-expressions
            bar.style.transition = '';
            wrap.style.display = 'block';
            inferProgress(msgEl.textContent);
        } else {
            // Loading finished — snap to 100 then hide
            setProgress(100);
            setTimeout(() => { wrap.style.display = 'none'; currentPct = 0; }, 400);
        }
    });

    const section = document.getElementById('loading-section');
    if (section) {
        sectionObserver.observe(section, { attributes: true, attributeFilter: ['style'] });
    }

    // Watch message text changes
    const msgObserver = new MutationObserver(() => inferProgress(msgEl.textContent));
    msgObserver.observe(msgEl, { childList: true, characterData: true, subtree: true });
}
