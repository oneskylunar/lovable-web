/**
 * ═══════════════════════════════════════════════════════════
 *  SONY WH-1000XM6 — SCROLL-LINKED IMAGE SEQUENCE ENGINE
 *  Handles: preloading, canvas rendering, scroll tracking,
 *  section transitions, navbar, and all micro-interactions.
 * ═══════════════════════════════════════════════════════════
 */

(function () {
  'use strict';

  /* ── Configuration ─────────────────────────────────────── */
  const CONFIG = {
    frameDir: './ezgif-87ce7761269a2dfe-jpg/',
    framePrefix: 'ezgif-frame-',
    frameExtension: '.jpg',
    totalFrames: 240,
    canvasAspect: 1920 / 1080,

    // Scroll section ranges (percentage of scroll-container)
    sections: [
      { id: 'section-hero',        start: 0.00, end: 0.15, nav: 'hero' },
      { id: 'section-engineering',  start: 0.12, end: 0.40, nav: 'engineering' },
      { id: 'section-anc',         start: 0.37, end: 0.65, nav: 'anc' },
      { id: 'section-sound',       start: 0.62, end: 0.85, nav: 'sound' },
      { id: 'section-cta',         start: 0.82, end: 1.00, nav: 'cta' },
    ],

    // Background color keyframes matched to actual frame backgrounds
    // Precisely sampled from corner pixels of key frames
    bgKeyframes: [
      { pos: 0.00, color: [10, 10, 14] },      // frame 1: near black, slight blue tint
      { pos: 0.08, color: [14, 14, 18] },       // frame 20: very dark
      { pos: 0.12, color: [28, 28, 32] },       // frame 30: starting to lighten
      { pos: 0.17, color: [100, 102, 108] },    // frame 40: medium-dark gray
      { pos: 0.21, color: [148, 150, 156] },    // frame 50: mid gray
      { pos: 0.25, color: [176, 178, 184] },    // frame 60: lighter gray
      { pos: 0.33, color: [210, 212, 218] },    // frame 80: light gray, near white
      { pos: 0.42, color: [228, 230, 236] },    // frame 100: very light
      { pos: 0.50, color: [234, 236, 242] },    // frame 120: peak lightness (fully exploded)
      { pos: 0.58, color: [228, 230, 236] },    // frame 140: still very light
      { pos: 0.67, color: [222, 224, 230] },    // frame 160: light
      { pos: 0.75, color: [210, 212, 218] },    // frame 180: starting to darken
      { pos: 0.83, color: [190, 192, 198] },    // frame 200: medium light
      { pos: 0.88, color: [160, 162, 168] },    // frame 210: medium
      { pos: 0.92, color: [130, 132, 138] },    // frame 220: medium dark
      { pos: 0.96, color: [105, 107, 112] },    // frame 230: darker
      { pos: 1.00, color: [80, 82, 88] },       // frame 240: ends mid-dark gray
    ],

    // Text color inversion thresholds (switch to dark text on light bg)
    lightBgThreshold: 120, // avg RGB value above which text inverts
  };


  /* ── DOM References ────────────────────────────────────── */
  const DOM = {
    preloader:      document.getElementById('preloader'),
    preloaderFill:  document.getElementById('preloader-fill'),
    preloaderText:  document.getElementById('preloader-text'),
    navbar:         document.getElementById('navbar'),
    navLinks:       document.querySelectorAll('.navbar__link'),
    menuToggle:     document.getElementById('menu-toggle'),
    scrollContainer:document.getElementById('scroll-container'),
    canvasWrapper:  document.getElementById('canvas-wrapper'),
    canvas:         document.getElementById('product-canvas'),
    ambientGlow:    document.getElementById('ambient-glow'),
    scrollHint:     document.getElementById('scroll-hint'),
    sections:       document.querySelectorAll('.overlay-section'),
    specCards:       document.querySelectorAll('.spec-card'),
  };

  const ctx = DOM.canvas.getContext('2d', { alpha: false });


  /* ── State ─────────────────────────────────────────────── */
  const state = {
    frames: [],
    loadedCount: 0,
    isLoaded: false,
    currentFrame: 0,
    scrollProgress: 0,
    lastScrollProgress: -1,
    rafId: null,
    viewportW: window.innerWidth,
    viewportH: window.innerHeight,
    isReducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  };


  /* ── Utilities ─────────────────────────────────────────── */

  /** Clamp value between min and max */
  function clamp(val, min, max) {
    return Math.min(Math.max(val, min), max);
  }

  /** Linear interpolation */
  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  /** Map value from one range to another */
  function mapRange(value, inMin, inMax, outMin, outMax) {
    return outMin + ((value - inMin) / (inMax - inMin)) * (outMax - outMin);
  }

  /** Ease out cubic for smoother scroll response */
  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  /** Pad number with leading zeros */
  function padNumber(n, width) {
    return String(n).padStart(width, '0');
  }

  /** Interpolate between two RGB colors */
  function lerpColor(c1, c2, t) {
    return [
      Math.round(lerp(c1[0], c2[0], t)),
      Math.round(lerp(c1[1], c2[1], t)),
      Math.round(lerp(c1[2], c2[2], t)),
    ];
  }

  /** Get interpolated background color for scroll position */
  function getBgColor(progress) {
    const kf = CONFIG.bgKeyframes;
    if (progress <= kf[0].pos) return kf[0].color;
    if (progress >= kf[kf.length - 1].pos) return kf[kf.length - 1].color;

    for (let i = 0; i < kf.length - 1; i++) {
      if (progress >= kf[i].pos && progress <= kf[i + 1].pos) {
        const t = (progress - kf[i].pos) / (kf[i + 1].pos - kf[i].pos);
        return lerpColor(kf[i].color, kf[i + 1].color, t);
      }
    }
    return kf[0].color;
  }


  /* ── Image Preloader ───────────────────────────────────── */
  function preloadFrames() {
    return new Promise((resolve) => {
      const frames = new Array(CONFIG.totalFrames);
      let loaded = 0;

      // Load in batches to avoid overwhelming the browser
      const batchSize = 12;
      let currentIndex = 0;

      function loadNext() {
        const end = Math.min(currentIndex + batchSize, CONFIG.totalFrames);

        for (let i = currentIndex; i < end; i++) {
          const img = new Image();
          const frameNum = padNumber(i + 1, 3);
          img.src = `${CONFIG.frameDir}${CONFIG.framePrefix}${frameNum}${CONFIG.frameExtension}`;

          img.onload = () => {
            frames[i] = img;
            loaded++;
            state.loadedCount = loaded;

            // Update preloader
            const pct = Math.round((loaded / CONFIG.totalFrames) * 100);
            DOM.preloaderFill.style.width = pct + '%';
            DOM.preloaderText.textContent = `Loading experience… ${pct}%`;

            if (loaded === CONFIG.totalFrames) {
              resolve(frames);
            }
          };

          img.onerror = () => {
            // Still count errors to avoid hanging
            loaded++;
            frames[i] = null;
            if (loaded === CONFIG.totalFrames) {
              resolve(frames);
            }
          };
        }

        currentIndex = end;
        if (currentIndex < CONFIG.totalFrames) {
          // Slight delay between batches
          setTimeout(loadNext, 20);
        }
      }

      loadNext();
    });
  }


  /* ── Canvas Rendering ──────────────────────────────────── */

  function resizeCanvas() {
    state.viewportW = window.innerWidth;
    state.viewportH = window.innerHeight;

    const dpr = Math.min(window.devicePixelRatio || 1, 2); // cap at 2x for performance

    // Cover the viewport while maintaining aspect ratio
    let drawW, drawH;
    const vpAspect = state.viewportW / state.viewportH;

    if (vpAspect > CONFIG.canvasAspect) {
      // Viewport is wider — match width
      drawW = state.viewportW;
      drawH = state.viewportW / CONFIG.canvasAspect;
    } else {
      // Viewport is taller — match height
      drawH = state.viewportH;
      drawW = state.viewportH * CONFIG.canvasAspect;
    }

    DOM.canvas.width = drawW * dpr;
    DOM.canvas.height = drawH * dpr;
    DOM.canvas.style.width = drawW + 'px';
    DOM.canvas.style.height = drawH + 'px';

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Re-render current frame
    renderFrame(state.currentFrame);
  }

  function renderFrame(index) {
    const frame = state.frames[index];
    if (!frame) return;

    const drawW = parseFloat(DOM.canvas.style.width);
    const drawH = parseFloat(DOM.canvas.style.height);

    ctx.clearRect(0, 0, drawW, drawH);
    ctx.drawImage(frame, 0, 0, drawW, drawH);
  }


  /* ── Scroll Tracking ───────────────────────────────────── */

  function getScrollProgress() {
    const container = DOM.scrollContainer;
    const rect = container.getBoundingClientRect();
    const containerHeight = container.scrollHeight || container.offsetHeight;
    const scrollableHeight = containerHeight - state.viewportH;

    if (scrollableHeight <= 0) return 0;

    const scrolled = -rect.top;
    return clamp(scrolled / scrollableHeight, 0, 1);
  }

  function getFrameIndex(progress) {
    return Math.min(
      Math.floor(progress * CONFIG.totalFrames),
      CONFIG.totalFrames - 1
    );
  }


  /* ── Section Visibility ────────────────────────────────── */

  function updateSections(progress) {
    CONFIG.sections.forEach((sec) => {
      const el = document.getElementById(sec.id);
      if (!el) return;

      // Calculate section-local progress with fade margins
      const fadeIn = 0.03;
      const fadeOut = 0.03;

      let opacity = 0;
      if (progress >= sec.start && progress <= sec.end) {
        // Fade in
        if (progress < sec.start + fadeIn) {
          opacity = mapRange(progress, sec.start, sec.start + fadeIn, 0, 1);
        }
        // Fade out
        else if (progress > sec.end - fadeOut) {
          opacity = mapRange(progress, sec.end - fadeOut, sec.end, 1, 0);
        }
        // Fully visible
        else {
          opacity = 1;
        }
      }

      opacity = clamp(opacity, 0, 1);

      if (opacity > 0.05) {
        el.classList.add('is-active');
        el.style.opacity = opacity;
      } else {
        el.classList.remove('is-active');
        el.style.opacity = 0;
      }
    });
  }


  /* ── Navbar ────────────────────────────────────────────── */

  function updateNavbar(progress) {
    // Show glassmorphism after slight scroll
    if (progress > 0.02) {
      DOM.navbar.classList.add('is-scrolled');
    } else {
      DOM.navbar.classList.remove('is-scrolled');
    }

    // Update active nav link
    let activeNav = 'hero';
    for (const sec of CONFIG.sections) {
      if (progress >= sec.start && progress <= sec.end) {
        activeNav = sec.nav;
      }
    }

    DOM.navLinks.forEach((link) => {
      const section = link.dataset.section;
      if (section === activeNav) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });
  }


  /* ── Dynamic Background Color ──────────────────────────── */

  function updateBackground(progress) {
    const bgColor = getBgColor(progress);
    const [r, g, b] = bgColor;
    document.body.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
    DOM.canvasWrapper.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;

    // Calculate average brightness
    const brightness = (r + g + b) / 3;

    // Toggle light/dark text mode
    const root = document.documentElement;
    if (brightness > CONFIG.lightBgThreshold) {
      root.classList.add('light-bg');
    } else {
      root.classList.remove('light-bg');
    }
  }


  /* ── Scroll Hint ───────────────────────────────────────── */

  function updateScrollHint(progress) {
    if (progress > 0.05 && DOM.scrollHint) {
      DOM.scrollHint.style.opacity = '0';
      DOM.scrollHint.style.transform = 'translateY(-10px)';
    }
  }


  /* ── Ambient Glow ──────────────────────────────────────── */

  function updateAmbientGlow(progress) {
    // Show glow during hero and CTA
    const showGlow = progress < 0.15 || progress > 0.85;
    if (showGlow) {
      DOM.ambientGlow.classList.add('is-visible');
    } else {
      DOM.ambientGlow.classList.remove('is-visible');
    }
  }


  /* ── Spec Cards — Intersection Observer ────────────────── */

  function initSpecCards() {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            // Stagger the animation
            const cards = Array.from(DOM.specCards);
            const index = cards.indexOf(entry.target);
            setTimeout(() => {
              entry.target.classList.add('is-visible');
            }, index * 100);
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -50px 0px' }
    );

    DOM.specCards.forEach((card) => observer.observe(card));
  }


  /* ── Mobile Menu ───────────────────────────────────────── */

  function initMobileMenu() {
    if (!DOM.menuToggle) return;
    DOM.menuToggle.addEventListener('click', () => {
      const isOpen = DOM.navbar.classList.toggle('is-menu-open');
      DOM.menuToggle.setAttribute('aria-expanded', isOpen);
    });

    // Close menu when clicking a link
    DOM.navLinks.forEach((link) => {
      link.addEventListener('click', () => {
        DOM.navbar.classList.remove('is-menu-open');
        DOM.menuToggle.setAttribute('aria-expanded', 'false');
      });
    });
  }


  /* ── Smooth scroll for nav links ───────────────────────── */

  function initNavLinks() {
    DOM.navLinks.forEach((link) => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const targetSection = link.dataset.section;
        const sectionConfig = CONFIG.sections.find(s => s.nav === targetSection);
        if (!sectionConfig) return;

        const container = DOM.scrollContainer;
        const containerHeight = container.scrollHeight || container.offsetHeight;
        const scrollableHeight = containerHeight - state.viewportH;

        // Calculate where to scroll to hit the section's start
        const targetScroll = container.offsetTop + (sectionConfig.start * scrollableHeight);

        window.scrollTo({
          top: targetScroll,
          behavior: 'smooth'
        });
      });
    });
  }


  /* ── Main Animation Loop ───────────────────────────────── */

  // Smoothed scroll progress for buttery feel
  let smoothProgress = 0;

  function tick() {
    const rawProgress = getScrollProgress();

    // Smooth interpolation for buttery scroll feel
    const smoothFactor = state.isReducedMotion ? 1 : 0.12;
    smoothProgress += (rawProgress - smoothProgress) * smoothFactor;

    // Snap to final value when very close to prevent drift
    if (Math.abs(smoothProgress - rawProgress) < 0.0005) {
      smoothProgress = rawProgress;
    }

    state.scrollProgress = smoothProgress;

    // Only update if progress actually changed
    if (Math.abs(smoothProgress - state.lastScrollProgress) > 0.0001) {
      // Frame
      const frameIndex = getFrameIndex(smoothProgress);
      if (frameIndex !== state.currentFrame) {
        state.currentFrame = frameIndex;
        renderFrame(frameIndex);
      }

      // Sections
      updateSections(smoothProgress);

      // Navbar
      updateNavbar(smoothProgress);

      // Background
      updateBackground(smoothProgress);

      // Scroll hint
      updateScrollHint(smoothProgress);

      // Ambient glow
      updateAmbientGlow(smoothProgress);

      state.lastScrollProgress = smoothProgress;
    }

    state.rafId = requestAnimationFrame(tick);
  }


  /* ── Light background text color overrides ─────────────── */
  function injectLightBgStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .light-bg .overlay__heading,
      .light-bg .overlay__heading--hero {
        background: linear-gradient(
          180deg,
          rgba(5, 5, 10, 0.92) 0%,
          rgba(5, 5, 10, 0.75) 60%,
          rgba(0, 50, 180, 0.60) 100%
        );
        -webkit-background-clip: text;
        background-clip: text;
        -webkit-text-fill-color: transparent;
      }

      .light-bg .overlay__heading--cta {
        background: linear-gradient(
          180deg,
          rgba(5, 5, 10, 0.92) 0%,
          rgba(5, 5, 10, 0.80) 70%,
          rgba(0, 50, 180, 0.50) 100%
        );
        -webkit-background-clip: text;
        background-clip: text;
        -webkit-text-fill-color: transparent;
      }

      .light-bg .overlay__eyebrow {
        color: rgba(5, 5, 10, 0.40);
      }

      .light-bg .overlay__subheading {
        color: rgba(5, 5, 10, 0.65);
      }

      .light-bg .overlay__body {
        color: rgba(5, 5, 10, 0.60);
      }

      .light-bg .overlay__body--hero {
        color: rgba(5, 5, 10, 0.40);
      }

      .light-bg .overlay__label-text {
        color: #0040CC;
      }

      .light-bg .overlay__label-line {
        background: linear-gradient(135deg, #0040CC, #0090DD);
      }

      .light-bg .overlay__stat-value {
        color: rgba(5, 5, 10, 0.90);
      }

      .light-bg .overlay__stat-label {
        color: rgba(5, 5, 10, 0.45);
      }

      .light-bg .overlay__feature-item {
        color: rgba(5, 5, 10, 0.60);
      }

      .light-bg .overlay__feature-icon {
        color: #0050CC;
      }

      .light-bg .overlay__anc-badge {
        background: rgba(0, 60, 200, 0.08);
        border-color: rgba(0, 60, 200, 0.18);
      }

      .light-bg .overlay__anc-badge-label {
        color: rgba(5, 5, 10, 0.90);
      }

      .light-bg .overlay__anc-badge-sub {
        color: #0050CC;
      }

      .light-bg .overlay__sound-bars span {
        background: linear-gradient(180deg, #0050CC, #0090DD);
      }

      .light-bg .overlay__scroll-hint {
        color: rgba(5, 5, 10, 0.35);
      }

      .light-bg .overlay__micro {
        color: rgba(5, 5, 10, 0.40);
      }

      .light-bg .btn--primary {
        box-shadow: 0 0 0 1px rgba(0, 80, 255, 0.25),
                    0 4px 24px rgba(0, 80, 255, 0.20),
                    0 1px 3px rgba(0, 0, 0, 0.15);
      }

      .light-bg .btn--secondary {
        color: #0050CC;
      }

      /* Navbar stays dark/glass always */
      .light-bg .navbar {
        /* Keep as-is - navbar is always dark glassmorphism */
      }
    `;
    document.head.appendChild(style);
  }


  /* ── Initialization ────────────────────────────────────── */

  async function init() {
    // Inject light-bg overrides
    injectLightBgStyles();

    // Start loading frames
    state.frames = await preloadFrames();
    state.isLoaded = true;

    // Initial canvas setup
    resizeCanvas();
    renderFrame(0);

    // Hide preloader
    DOM.preloader.classList.add('is-hidden');

    // Activate hero section after slight delay
    setTimeout(() => {
      const heroSection = document.getElementById('section-hero');
      if (heroSection) heroSection.classList.add('is-active');
      DOM.ambientGlow.classList.add('is-visible');
    }, 300);

    // Start animation loop
    tick();

    // Init sub-features
    initSpecCards();
    initMobileMenu();
    initNavLinks();

    // Resize handler
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        resizeCanvas();
      }, 100);
    });
  }

  // Go!
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
