const _nextCallAt = {};

export async function throttle(key, minIntervalMs) {
    const now = Date.now();
    const next = Math.max(now, _nextCallAt[key] ?? 0);
    _nextCallAt[key] = next + minIntervalMs;
    const wait = next - now;
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
}
