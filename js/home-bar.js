// js/home-bar.js - Android home-indicator / navigation-bar bottom inset
//
// On iOS, env(safe-area-inset-bottom) reports the home-indicator height, so
// bottom-anchored UI (route selectors) pads above it. On Android in a normal
// browser tab (not a standalone PWA) that env value is 0 even when the home
// pill is drawn OVER the viewport. Measure the overlay directly by comparing
// the layout viewport (innerHeight) with the visual viewport, and expose it
// as --home-bar-inset so CSS can pad above it just like it does on iOS.

(function() {
    if (!window.visualViewport || !/Android/i.test(navigator.userAgent || '')) return;

    function updateHomeBarInset() {
        const vv = window.visualViewport;
        // Bottom chrome overlay = layout viewport height minus the visible
        // (visual) viewport, minus anything hidden at the top (address bar).
        const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
        // Only small values are a nav bar / home pill; the on-screen keyboard
        // also shrinks the visual viewport but is far taller, so skip it.
        if (inset > 0 && inset <= 100) {
            document.documentElement.style.setProperty('--home-bar-inset', Math.round(inset) + 'px');
        }
    }

    updateHomeBarInset();

    // Re-measure when the viewport changes (address-bar collapse, rotation,
    // nav-bar show/hide). Debounced because visualViewport fires rapidly while
    // scrolling or typing.
    let raf = null;
    function schedule() {
        if (raf) return;
        raf = requestAnimationFrame(() => {
            raf = null;
            updateHomeBarInset();
        });
    }
    window.visualViewport.addEventListener('resize', schedule);
    window.visualViewport.addEventListener('scroll', schedule);
    window.addEventListener('resize', schedule);

    // Ensure it settles after the URL bar finishes collapsing on load.
    setTimeout(updateHomeBarInset, 500);
})();
