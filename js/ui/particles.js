/*
  particles.js
  Animated particle-network background.
  Reads --accent-rgb from the active CSS theme so the
  particle color updates automatically when the theme changes.
*/

(function () {
    var canvas = document.getElementById('bg-canvas');
    if (!canvas) return;

    var ctx = canvas.getContext('2d');
    var N    = 60;
    var DIST = 130;
    var accentRgb = '0, 212, 255';
    var particles = [];

    function readAccentRgb() {
        var val = getComputedStyle(document.documentElement)
            .getPropertyValue('--accent-rgb').trim();
        accentRgb = val || '0, 212, 255';
    }

    function resize() {
        canvas.width  = window.innerWidth;
        canvas.height = window.innerHeight;
    }

    function init() {
        resize();
        readAccentRgb();
        particles = [];
        for (var i = 0; i < N; i++) {
            particles.push({
                x:  Math.random() * canvas.width,
                y:  Math.random() * canvas.height,
                vx: (Math.random() - 0.5) * 0.35,
                vy: (Math.random() - 0.5) * 0.35,
                r:  Math.random() * 1.2 + 0.4
            });
        }
    }

    function tick() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        for (var i = 0; i < N; i++) {
            var p = particles[i];
            p.x += p.vx;
            p.y += p.vy;
            if (p.x < 0 || p.x > canvas.width)  p.vx *= -1;
            if (p.y < 0 || p.y > canvas.height)  p.vy *= -1;

            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(' + accentRgb + ', 0.55)';
            ctx.fill();

            for (var j = i + 1; j < N; j++) {
                var q  = particles[j];
                var dx = p.x - q.x;
                var dy = p.y - q.y;
                var d  = Math.sqrt(dx * dx + dy * dy);
                if (d < DIST) {
                    ctx.beginPath();
                    ctx.moveTo(p.x, p.y);
                    ctx.lineTo(q.x, q.y);
                    ctx.strokeStyle = 'rgba(' + accentRgb + ', ' +
                        ((1 - d / DIST) * 0.22).toFixed(3) + ')';
                    ctx.lineWidth = 0.6;
                    ctx.stroke();
                }
            }
        }

        requestAnimationFrame(tick);
    }

    window.addEventListener('resize', resize);

    /* Re-read accent color whenever the theme changes */
    new MutationObserver(readAccentRgb).observe(
        document.documentElement,
        { attributes: true, attributeFilter: ['data-theme'] }
    );

    init();
    tick();
})();
