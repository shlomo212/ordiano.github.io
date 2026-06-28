/* ============================================
   script.js — Ordiano Acrylic Magnetic Hat Rack
   Order: video logic → scroll animations → nav behavior
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {

  /* ── VIDEO SCROLL SCRUBBING ────────────────────────────────────────
     Lerp-chase approach — Apple-style inertia:
       - Scroll handler writes only to targetProgress (raw 0–1).
       - The rAF loop lerps displayProgress toward targetProgress each
         frame, then drives BOTH video.currentTime and heroCopy opacity
         from displayProgress so the two stay perfectly in sync.
       - SEEK_THRESHOLD skips redundant decoder calls when at rest.
       - smoothstep() shapes the copy fade so it accelerates in and
         decelerates out instead of moving at a constant linear rate.

     Lerp factor 0.09:
       Closes ~9 % of the gap each frame at 60 fps → ~160 ms to settle
       from a cold scroll — perceptually instant but with organic ease.
  ─────────────────────────────────────────────────────────────────── */

  const video         = document.getElementById('heroVideo');
  const loader        = document.getElementById('heroLoader');
  const scrollWrapper = document.getElementById('heroScrollWrapper');
  const heroCopy      = document.getElementById('heroCopy');
  const scrollHint    = document.getElementById('scrollHint');

  /* ── LENIS SMOOTH SCROLL ─────────────────────────────────────────
     Physics-based scroll inertia. RAF is driven inside scrubLoop so
     there is only one requestAnimationFrame chain on the page.
  ─────────────────────────────────────────────────────────────────── */
  let lenis = null;
  if (typeof Lenis !== 'undefined') {
    lenis = new Lenis({
      duration:        1.2,
      easing:          t => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel:     true,
      syncTouch:       false,   // iOS Safari safety
      touchMultiplier: 1.5,
    });
    document.documentElement.classList.add('lenis-active');
  }

  const PX_PER_SECOND  = 250;    // scroll real estate per second of video
  const LERP_FACTOR    = 0.09;   // chase speed — 0.08 (dreamier) → 0.12 (snappier)
  const SEEK_THRESHOLD = 0.001;  // s — skip seek when displayTime is this close

  let targetProgress  = 0;   // raw scroll progress, updated by scroll handler
  let displayProgress = 0;   // lerped shadow, drives video + copy each frame
  let videoReady      = false;
  let scrollHintGone  = false;

  /* Smoothstep — cubic ease-in-out applied to normalised opacity values.
     Makes fade-in accelerate and fade-out decelerate instead of moving
     at a flat linear rate, which reads as more organic / intentional. */
  const smoothstep = t => t * t * (3 - 2 * t);

  /* ── WRAPPER HEIGHT ───────────────────────────────────────────────
     Called once duration is known. Clears the CSS min-height so it
     can't override the JS-set exact height.
  ─────────────────────────────────────────────────────────────────── */
  const applyWrapperHeight = () => {
    const dur = video.duration;
    if (dur && isFinite(dur) && dur > 0) {
      scrollWrapper.style.minHeight = 'unset';
      scrollWrapper.style.height    = `${dur * PX_PER_SECOND}px`;
    }
  };

  /* ── VIDEO READY ──────────────────────────────────────────────────
     Hide loader and reveal video. The scrub loop is already running —
     the videoReady flag gates actual seeks until the decoder is ready.
  ─────────────────────────────────────────────────────────────────── */
  const onVideoReady = () => {
    if (videoReady) return;
    videoReady = true;
    applyWrapperHeight();
    loader.classList.add('hidden');
    video.classList.add('ready');
  };

  /* ── HERO COPY OPACITY ────────────────────────────────────────────
     Driven from displayProgress (the lerped value) each rAF tick, so
     the copy always matches the video's visual position — not the raw
     scroll position.
       Fade in:  progress 0.05 → 0.20  (smoothstepped)
       Hold:     progress 0.20 → 0.72
       Fade out: progress 0.72 → 0.88  (smoothstepped)
  ─────────────────────────────────────────────────────────────────── */
  const applyHeroCopyOpacity = (progress) => {
    let t = 0;
    if (progress >= 0.05 && progress <= 0.20) {
      t = (progress - 0.05) / 0.15;
    } else if (progress > 0.20 && progress <= 0.72) {
      t = 1;
    } else if (progress > 0.72 && progress <= 0.88) {
      t = 1 - (progress - 0.72) / 0.16;
    }
    const opacity = smoothstep(Math.max(0, Math.min(1, t)));
    const ty      = (1 - Math.min(opacity * 2, 1)) * 18;
    heroCopy.style.opacity   = opacity;
    heroCopy.style.transform = `translateY(${ty}px)`;
  };

  /* ── SCRUB LOOP ───────────────────────────────────────────────────
     Runs for the full page lifetime from first rAF call.
     Each frame:
       1. Lerp displayProgress toward targetProgress.
       2. Seek video only when the delta exceeds SEEK_THRESHOLD
          (keeps the decoder idle at rest — no pointless micro-seeks).
       3. Drive hero copy opacity from the same displayProgress so
          text and video are always visually in sync.
  ─────────────────────────────────────────────────────────────────── */
  const scrollProgress = document.getElementById('scrollProgress');
  const maxScroll      = () => document.documentElement.scrollHeight - window.innerHeight;

  const scrubLoop = (time) => {
    lenis?.raf(time);   // step Lenis physics — one RAF to rule them all

    if (videoReady) {
      displayProgress += (targetProgress - displayProgress) * LERP_FACTOR;

      const displayTime = displayProgress * video.duration;
      if (Math.abs(displayTime - video.currentTime) > SEEK_THRESHOLD) {
        video.currentTime = displayTime;
      }

      applyHeroCopyOpacity(displayProgress);
    }

    // Scroll progress bar — direct DOM write, no React state
    if (scrollProgress) {
      scrollProgress.style.width = `${Math.min(100, (window.scrollY / maxScroll()) * 100)}%`;
    }

    requestAnimationFrame(scrubLoop);
  };

  // Start immediately — videoReady flag prevents seeks until decoder is ready
  requestAnimationFrame(scrubLoop);

  /* ── SCROLL HANDLER ───────────────────────────────────────────────
     Only responsible for two things:
       1. Update targetTime from scroll position
       2. Update hero copy opacity
     All video manipulation is in scrubLoop — no rAF queued here.
  ─────────────────────────────────────────────────────────────────── */
  window.addEventListener('scroll', () => {
    if (!videoReady) return;

    const wrapperTop      = scrollWrapper.getBoundingClientRect().top;
    const scrollableRange = scrollWrapper.offsetHeight - window.innerHeight;
    targetProgress = Math.max(0, Math.min(1, -wrapperTop / scrollableRange));

    if (!scrollHintGone && window.scrollY > 20) {
      scrollHintGone = true;
      scrollHint.classList.add('hidden');
    }
  }, { passive: true });

  /* ── VIDEO EVENTS ─────────────────────────────────────────────────*/
  video.addEventListener('loadedmetadata', () => {
    applyWrapperHeight();
    video.currentTime = 0;
  });

  video.addEventListener('loadeddata', () => {
    if (video.readyState >= 3) onVideoReady();
  });

  video.addEventListener('canplaythrough', onVideoReady);

  video.addEventListener('error', () => {
    scrollWrapper.style.height = '100vh';
    loader.innerHTML = `
      <div style="text-align:center;color:rgba(255,255,255,0.45);padding:48px 24px">
        <p style="font-size:.875rem;letter-spacing:.05em;line-height:2">
          Place your product video in this folder<br>
          and name it <strong style="color:rgba(255,255,255,0.75)">hero-scroll.mp4</strong>
        </p>
      </div>`;
  });

  video.load();


  /* ── SCROLL REVEAL ────────────────────────────────────────────────
     IntersectionObserver — fires once per element at 15% threshold.
     Stagger via --i custom property → transition-delay in CSS.
  ─────────────────────────────────────────────────────────────────── */
  document.querySelectorAll('.feature-card').forEach((card, i) => {
    card.style.setProperty('--i', i);
  });

  document.querySelectorAll('.why-card').forEach((card, i) => {
    card.style.setProperty('--i', i * 0.1);
  });

  document.querySelectorAll('.gallery__item').forEach((item, i) => {
    item.style.setProperty('--i', i * 0.4);
  });

  document.querySelectorAll('.spec-item').forEach((item, i) => {
    item.style.setProperty('--i', i * 0.15);
  });

  document.querySelectorAll('.testimonial-card').forEach((card, i) => {
    card.style.setProperty('--i', i * 0.12);
  });

  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });

  document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

  /* ── GALLERY CAROUSEL — scroll-spun 3D ring ──────────────────────
     Photos are arranged around a circle in 3D space (rotateY + translateZ).
     Scrolling through the tall wrapper spins the whole ring on its Y axis,
     so each card sweeps to the front and back as the user scrolls past.
  ─────────────────────────────────────────────────────────────────── */
  const galleryWrap = document.getElementById('galleryCarouselWrap');
  const galleryRing  = document.getElementById('galleryRing');

  if (galleryWrap && galleryRing) {
    const items  = Array.from(galleryRing.querySelectorAll('.gallery__citem'));
    const count  = items.length;
    const angleStep = 360 / count;

    const setRadius = () => {
      const cardWidth = items[0].getBoundingClientRect().width || 300;
      // Cap radius so large near-full-screen cards stay visible in the viewport.
      // Raw formula pushes cards too far back when cardWidth > ~60vw.
      const rawRadius = Math.round((cardWidth / 2) / Math.tan(Math.PI / count)) + 40;
      const maxRadius = Math.round(window.innerWidth * 0.6);
      const radius = Math.min(rawRadius, maxRadius);
      items.forEach((item, i) => {
        const angle = angleStep * i;
        item.style.transform = `rotateY(${angle}deg) translateZ(${radius}px)`;
      });
    };

    setRadius();
    window.addEventListener('resize', setRadius);

    let galleryRotation = 0;
    let galleryTarget   = 0;

    const updateGalleryRotation = () => {
      const rect = galleryWrap.getBoundingClientRect();
      const scrollable = galleryWrap.offsetHeight - window.innerHeight;
      const progress = scrollable > 0
        ? Math.max(0, Math.min(1, -rect.top / scrollable))
        : 0;
      galleryTarget = progress * 360; // one full turn across the scroll runway
    };

    window.addEventListener('scroll', updateGalleryRotation, { passive: true });
    window.addEventListener('resize', updateGalleryRotation);
    updateGalleryRotation();

    const animateGalleryRing = () => {
      galleryRotation += (galleryTarget - galleryRotation) * 0.08;
      galleryRing.style.transform = `rotateY(${galleryRotation}deg)`;
      requestAnimationFrame(animateGalleryRing);
    };
    requestAnimationFrame(animateGalleryRing);
  }

  /* ── FLOATING BUY BUTTON ──────────────────────────────────────────
     Appears once the hero section fully leaves the viewport.
     IntersectionObserver is cheaper than a scroll handler for this.
  ─────────────────────────────────────────────────────────────────── */
  const floatBuy   = document.getElementById('floatBuy');
  const heroSection = document.getElementById('hero');

  const heroVisObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      floatBuy.classList.toggle('visible', !entry.isIntersecting);
    });
  }, { threshold: 0 });

  heroVisObserver.observe(heroSection);

  /* ── 3D CARD TILT ─────────────────────────────────────────────────
     MouseMove → inline rotateX/rotateY driven by cursor position within
     the card. MouseLeave → spring back to rest via CSS transition.
     Inline style overrides any CSS :hover transform automatically.
  ─────────────────────────────────────────────────────────────────── */
  document.querySelectorAll('.feature-card, .why-card, .testimonial-card').forEach(card => {
    card.addEventListener('mouseenter', () => {
      card.style.transition = 'box-shadow var(--transition)';
      card.style.willChange = 'transform';
    });

    card.addEventListener('mousemove', e => {
      const r    = card.getBoundingClientRect();
      const x    = (e.clientX - r.left) / r.width  - 0.5;
      const y    = (e.clientY - r.top)  / r.height - 0.5;
      const tiltX = -(y * 10).toFixed(2);
      const tiltY =  (x * 10).toFixed(2);
      card.style.transform =
        `perspective(700px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) translateY(-6px) scale(1.01)`;
    });

    card.addEventListener('mouseleave', () => {
      card.style.transition =
        'transform 0.6s cubic-bezier(0.16,1,0.3,1), box-shadow var(--transition)';
      card.style.transform  = '';
      card.style.willChange = '';
      // Clear inline transition after spring-back
      setTimeout(() => { card.style.transition = ''; }, 650);
    });
  });

  /* ── MAGNETIC BUTTONS ─────────────────────────────────────────────
     Cursor proximity pulls the button toward the mouse — 25 % strength.
     Applied only to large CTA buttons and the floating pill.
  ─────────────────────────────────────────────────────────────────── */
  document.querySelectorAll('.btn-large, .float-buy').forEach(btn => {
    btn.addEventListener('mouseenter', () => {
      btn.style.transition = 'transform 0.15s ease, box-shadow var(--transition)';
    });

    btn.addEventListener('mousemove', e => {
      const r = btn.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width  - 0.5) * r.width  * 0.28;
      const y = ((e.clientY - r.top)  / r.height - 0.5) * r.height * 0.28;
      btn.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    });

    btn.addEventListener('mouseleave', () => {
      btn.style.transition = 'transform 0.5s cubic-bezier(0.16,1,0.3,1), box-shadow var(--transition)';
      btn.style.transform  = '';
      setTimeout(() => { btn.style.transition = ''; }, 520);
    });
  });


  /* ── NAV BEHAVIOR ─────────────────────────────────────────────────
     hero-mode → white text / ghost CTA over dark video
     scrolled  → frosted glass, dark text, solid blue CTA
     rAF-throttled to one DOM write per frame.
  ─────────────────────────────────────────────────────────────────── */
  const nav  = document.getElementById('nav');
  const hero = document.getElementById('hero');
  let navTicking = false;

  const updateNav = () => {
    const scrollY    = window.scrollY;
    const heroBottom = hero.offsetTop + hero.offsetHeight;
    nav.classList.toggle('scrolled',  scrollY > 80);
    nav.classList.toggle('hero-mode', scrollY < heroBottom - 120);
    navTicking = false;
  };

  window.addEventListener('scroll', () => {
    if (!navTicking) {
      requestAnimationFrame(updateNav);
      navTicking = true;
    }
  }, { passive: true });

  updateNav();

});
