import { supabase, isConfigured } from './supabase.js';

// ── State ────────────────────────────────────────────────────────────────────

let _user = null;
const _listeners = [];

export function getUser() { return _user; }

export function onAuthStateChange(cb) {
    _listeners.push(cb);
    cb(_user);
}

function _notify() { _listeners.forEach(cb => cb(_user)); }

// ── Auth operations ───────────────────────────────────────────────────────────

export async function signInWithEmail(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
}

export async function signUpWithEmail(email, password) {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    return data;
}

export async function signInWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.href },
    });
    if (error) throw error;
}

export async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function _openModal()  { document.getElementById('auth-modal').style.display = 'flex'; }
function _closeModal() { document.getElementById('auth-modal').style.display = 'none'; }

// ── Widget ────────────────────────────────────────────────────────────────────

function _renderWidget(user) {
    const widget = document.getElementById('auth-widget');
    if (!widget) return;

    if (user) {
        const initial = (user.email || '?')[0].toUpperCase();
        const hasDecksPanel = !!document.getElementById('my-decks-panel');
        widget.innerHTML = `
            <button class="auth-avatar" id="auth-avatar-btn" aria-haspopup="true" aria-expanded="false"
                    title="${_esc(user.email || '')}">${_esc(initial)}</button>
            <div class="auth-dropdown" id="auth-dropdown" role="menu">
                <div class="auth-dropdown-email">${_esc(user.email || '')}</div>
                ${hasDecksPanel ? `<button class="auth-dropdown-item" id="auth-my-decks-btn" role="menuitem">My Decks</button>` : ''}
                <button class="auth-dropdown-item auth-dropdown-item--danger" id="auth-signout-btn" role="menuitem">Sign out</button>
            </div>`;

        document.getElementById('auth-avatar-btn').addEventListener('click', e => {
            e.stopPropagation();
            const dd = document.getElementById('auth-dropdown');
            const open = dd.classList.toggle('open');
            document.getElementById('auth-avatar-btn').setAttribute('aria-expanded', String(open));
        });
        document.getElementById('auth-signout-btn').addEventListener('click', () => {
            document.getElementById('auth-dropdown').classList.remove('open');
            signOut().catch(console.error);
        });
        document.getElementById('auth-my-decks-btn')?.addEventListener('click', () => {
            document.getElementById('auth-dropdown').classList.remove('open');
            window.dispatchEvent(new CustomEvent('auth:show-decks'));
        });
    } else {
        widget.innerHTML = `<button class="auth-signin-btn" id="auth-open-modal">Sign in</button>`;
        document.getElementById('auth-open-modal').addEventListener('click', _openModal);
    }
}

// ── Init ─────────────────────────────────────────────────────────────────────

function _init() {
    const modal = document.getElementById('auth-modal');
    if (!modal) return;

    // Close button
    document.getElementById('auth-modal-close').addEventListener('click', _closeModal);

    // Click outside modal box
    modal.addEventListener('click', e => { if (e.target === modal) _closeModal(); });

    // Tab switching
    modal.querySelectorAll('.auth-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            modal.querySelectorAll('.auth-tab').forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected','false'); });
            modal.querySelectorAll('.auth-panel').forEach(p => p.classList.add('hidden'));
            tab.classList.add('active');
            tab.setAttribute('aria-selected', 'true');
            modal.querySelector(`#auth-panel-${tab.dataset.tab}`).classList.remove('hidden');
        });
    });

    // Google auth
    [document.getElementById('auth-google-signin'), document.getElementById('auth-google-signup')].forEach(btn => {
        btn?.addEventListener('click', () => signInWithGoogle().catch(e => console.error('Google auth:', e)));
    });

    // Email sign-in
    async function _doSignIn() {
        const msg = document.getElementById('auth-msg-signin');
        msg.textContent = '';
        msg.classList.remove('auth-msg--ok');
        try {
            await signInWithEmail(
                document.getElementById('auth-email-signin').value.trim(),
                document.getElementById('auth-pass-signin').value
            );
            _closeModal();
        } catch (e) { msg.textContent = e.message; }
    }
    document.getElementById('auth-submit-signin').addEventListener('click', _doSignIn);
    document.getElementById('auth-pass-signin').addEventListener('keydown', e => { if (e.key === 'Enter') _doSignIn(); });

    // Email sign-up
    async function _doSignUp() {
        const msg = document.getElementById('auth-msg-signup');
        msg.textContent = '';
        msg.classList.remove('auth-msg--ok');
        try {
            await signUpWithEmail(
                document.getElementById('auth-email-signup').value.trim(),
                document.getElementById('auth-pass-signup').value
            );
            msg.classList.add('auth-msg--ok');
            msg.textContent = 'Check your email to confirm your account.';
        } catch (e) { msg.textContent = e.message; }
    }
    document.getElementById('auth-submit-signup').addEventListener('click', _doSignUp);
    document.getElementById('auth-pass-signup').addEventListener('keydown', e => { if (e.key === 'Enter') _doSignUp(); });

    // Close dropdown on outside click
    document.addEventListener('click', () => {
        document.getElementById('auth-dropdown')?.classList.remove('open');
        document.getElementById('auth-avatar-btn')?.setAttribute('aria-expanded', 'false');
    });

    supabase.auth.onAuthStateChange((_event, session) => {
        _user = session?.user ?? null;
        _renderWidget(_user);
        _notify();
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
        _user = session?.user ?? null;
        _renderWidget(_user);
        _notify();
    });
}

if (isConfigured) _init();
