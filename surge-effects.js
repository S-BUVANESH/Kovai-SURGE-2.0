/* ============================================================
   KOVAI~SURGE — Premium Effects Engine (JavaScript)
   Shared across all pages: cursor tracer, 3D tilt, particles, 
   ambient orbs, scanline
   ============================================================ */

(function SurgeEffects() {
    'use strict';

    // --- Inject DOM elements ---
    function injectEffects() {
        const body = document.body;

        // Grid background
        const grid = document.createElement('div');
        grid.className = 'grid-bg';
        body.insertBefore(grid, body.firstChild);

        // Ambient lighting orbs
        ['ambient-orb-1', 'ambient-orb-2', 'ambient-orb-3'].forEach(cls => {
            const orb = document.createElement('div');
            orb.className = `ambient-orb ${cls}`;
            body.insertBefore(orb, body.firstChild);
        });

        // Scanline
        const scanline = document.createElement('div');
        scanline.className = 'scanline';
        body.appendChild(scanline);

        // Particle field
        const particleField = document.createElement('div');
        particleField.className = 'particle-field';
        for (let i = 0; i < 20; i++) {
            const p = document.createElement('div');
            p.className = 'particle';
            const size = Math.random() * 3 + 1;
            p.style.cssText = `
                width: ${size}px; height: ${size}px;
                left: ${Math.random() * 100}%;
                background: ${Math.random() > 0.5 ? 'var(--surge-green)' : '#3b82f6'};
                animation-duration: ${Math.random() * 15 + 10}s;
                animation-delay: ${Math.random() * 10}s;
                box-shadow: 0 0 ${size * 3}px ${Math.random() > 0.5 ? 'var(--surge-green)' : '#3b82f6'};
            `;
            particleField.appendChild(p);
        }
        body.insertBefore(particleField, body.firstChild);

        // Cursor tracer
        const tracer = document.createElement('div');
        tracer.className = 'cursor-tracer';
        tracer.id = 'surgeTracer';
        body.appendChild(tracer);
    }

    // --- Cursor Tracer Engine ---
    function initCursorTracer() {
        const tracer = document.getElementById('surgeTracer');
        if (!tracer) return;

        const trails = [];
        const TRAIL_COUNT = 12;

        for (let i = 0; i < TRAIL_COUNT; i++) {
            const dot = document.createElement('div');
            dot.className = 'cursor-trail';
            const size = Math.max(2, 8 - i * 0.5);
            dot.style.width = size + 'px';
            dot.style.height = size + 'px';
            dot.style.opacity = (1 - i / TRAIL_COUNT) * 0.4;
            document.body.appendChild(dot);
            trails.push({ el: dot, x: 0, y: 0 });
        }

        let mx = 0, my = 0;

        document.addEventListener('mousemove', (e) => {
            mx = e.clientX;
            my = e.clientY;
            tracer.style.left = mx + 'px';
            tracer.style.top = my + 'px';
        });

        // Interactive hover grow
        document.addEventListener('mouseover', (e) => {
            if (e.target.matches('a, button, input, select, textarea, .card-3d, .stat-3d, .btn-premium, .scale-bounce, [role="button"]')) {
                tracer.style.width = '40px';
                tracer.style.height = '40px';
                tracer.style.background = 'radial-gradient(circle, rgba(83,210,45,0.35) 0%, transparent 70%)';
            }
        });
        document.addEventListener('mouseout', (e) => {
            if (e.target.matches('a, button, input, select, textarea, .card-3d, .stat-3d, .btn-premium, .scale-bounce, [role="button"]')) {
                tracer.style.width = '20px';
                tracer.style.height = '20px';
                tracer.style.background = 'radial-gradient(circle, rgba(83,210,45,0.6) 0%, transparent 70%)';
            }
        });

        // Animate trails
        function animate() {
            let px = mx, py = my;
            trails.forEach((t, i) => {
                const speed = 0.15 - (i * 0.008);
                t.x += (px - t.x) * speed;
                t.y += (py - t.y) * speed;
                t.el.style.left = t.x + 'px';
                t.el.style.top = t.y + 'px';
                px = t.x;
                py = t.y;
            });
            requestAnimationFrame(animate);
        }
        animate();
    }

    // --- 3D Card Tilt (mouse follow) ---
    function init3DCards() {
        document.querySelectorAll('.card-3d').forEach(card => {
            card.addEventListener('mousemove', (e) => {
                const rect = card.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                const centerX = rect.width / 2;
                const centerY = rect.height / 2;
                const rotateX = ((y - centerY) / centerY) * -6;
                const rotateY = ((x - centerX) / centerX) * 6;
                card.style.transform = `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.02)`;
            });
            card.addEventListener('mouseleave', () => {
                card.style.transform = 'perspective(800px) rotateX(0) rotateY(0) scale(1)';
            });
        });
    }

    // --- Stat Card Mouse Glow ---
    function initStatGlow() {
        document.querySelectorAll('.stat-3d').forEach(card => {
            card.addEventListener('mousemove', (e) => {
                const rect = card.getBoundingClientRect();
                const x = ((e.clientX - rect.left) / rect.width) * 100;
                const y = ((e.clientY - rect.top) / rect.height) * 100;
                card.style.setProperty('--mouse-x', x + '%');
                card.style.setProperty('--mouse-y', y + '%');
            });
        });
    }

    // --- Fade-in on scroll ---
    function initScrollFadeIn() {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('fade-up');
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.1 });

        document.querySelectorAll('.observe-fade').forEach(el => observer.observe(el));
    }

    // --- Init ---
    function init() {
        injectEffects();
        initCursorTracer();
        // Wait for DOM to settle then init interactive effects
        requestAnimationFrame(() => {
            init3DCards();
            initStatGlow();
            initScrollFadeIn();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
