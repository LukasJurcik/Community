/* ============================================
   CORE ANIMATION MODULE — GSAP + ScrollTrigger + Lenis
   ============================================ */

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Wait for DOM to be painted and fonts to load
 * @param {Element} scope - DOM scope to wait for
 * @returns {Promise} - Resolves when ready
 */
function afterSwapReady(scope = document) {
  return new Promise(async (resolve) => {
    await new Promise(r => requestAnimationFrame(r));
    try { await document.fonts?.ready; } catch (e) {}
    resolve();
  });
}
window.afterSwapReady = afterSwapReady;

// ============================================
// LENIS SCROLL BRIDGE
// ============================================

/**
 * Bridge Lenis smooth scroll with ScrollTrigger
 * Call once to sync smooth scrolling with GSAP animations
 */
function installLenisScrollTriggerBridge() {
  if (!window.gsap || !window.ScrollTrigger) return;
  if (installLenisScrollTriggerBridge._done) return;
  installLenisScrollTriggerBridge._done = true;

  let connectRetries = 0;
  const MAX_CONNECT_RETRIES = 100; // 5 seconds at 50ms intervals

  const connect = () => {
    if (!window.lenis) {
      if (++connectRetries > MAX_CONNECT_RETRIES) {
        console.error('❌ Lenis failed to load after 5 seconds. Scroll bridge disabled.');
        return;
      }
      setTimeout(connect, 50);
      return;
    }

    window.gsap.registerPlugin(window.ScrollTrigger);

    // Tell ST to use the page as scroller; delegate to Lenis
    window.ScrollTrigger.scrollerProxy(document.body, {
      scrollTop(value) {
        return arguments.length
          ? window.lenis.scrollTo(value, { immediate: true })
          : window.pageYOffset;
      },
      getBoundingClientRect() {
        return { top: 0, left: 0, width: window.innerWidth, height: window.innerHeight };
      }
    });

    // Keep them in sync
    window.lenis.on?.('scroll', window.ScrollTrigger.update);
    window.gsap.ticker.add(() => window.lenis?.raf?.(performance.now()));
    window.ScrollTrigger.addEventListener('refresh', () => window.lenis?.update?.());
    window.ScrollTrigger.refresh();
  };
  connect();
}
window.installLenisScrollTriggerBridge = installLenisScrollTriggerBridge;

// ============================================
// LENIS INITIALIZATION
// ============================================

/**
 * Initialize Lenis smooth scrolling
 * autoRaf: false because we use GSAP's ticker (via installLenisScrollTriggerBridge)
 * This prevents double RAF loops and reduces CPU usage
 */
window.lenis = new window.Lenis({
  autoRaf: false,
  lerp: 0.2,
  smoothWheel: true,
  smoothTouch: true
})

// If stop-scroll is active (from loader in head), keep Lenis stopped
if (document.documentElement.classList.contains('stop-scroll')) {
  window.lenis.stop()
}

// Always start at the top on load/refresh, even if the browser tried
// to restore a previous scroll position
window.lenis.scrollTo(0, { immediate: true })

// Wire Lenis into GSAP's ticker + ScrollTrigger (defined above)
installLenisScrollTriggerBridge()

// Configure ScrollTrigger default configuration for Webflow interactions
if (window.ScrollTrigger) {
  ScrollTrigger.defaults({
    scroller: document.body,
    preventOverlaps: true
  })
}

// Helper function to refresh ScrollTrigger when needed
function refreshScrollTrigger() {
  if (window.ScrollTrigger) {
    ScrollTrigger.refresh()
  }
}
window.refreshScrollTrigger = refreshScrollTrigger

// ============================================
// Bunny (bunny.net) custom video setup — autoplay/click/hover handling for [data-media-init] elements
// ============================================

function initMediaSetup() {
  const mediaElements = document.querySelectorAll('[data-media-init]')
  if (!mediaElements.length) return

  const pauseDelay = 200
  const viewportOffset = 0.75
  const isHoverDevice = window.matchMedia('(hover: hover) and (pointer: fine)').matches

  initMediaSetup._cleanup?.forEach(fn => fn())
  const cleanupFns = []
  const rootMarginValue = viewportOffset * 100

  mediaElements.forEach(mediaEl => {
    const video = mediaEl.querySelector('[data-media-video-src]')
    if (!video) return

    const mode = mediaEl.dataset.mediaMode || 'autoplay'
    const touchMode = mediaEl.dataset.mediaTouchMode
    const resetAttr = mediaEl.dataset.mediaReset
    const pausedStatusAttr = mediaEl.dataset.mediaOnPause
    const toggleElements = [...mediaEl.querySelectorAll('[data-media-toggle]')]

    const activeMode = !isHoverDevice ? (touchMode || (mode === 'hover' ? 'autoplay' : mode)) : mode
    const shouldResetOnPause = resetAttr === 'true' ? true : resetAttr === 'false' ? false : activeMode === 'hover'
    const pausedStatus = pausedStatusAttr === 'paused' ? 'paused' : 'not-active'

    const clickTargets = toggleElements.length ? toggleElements : [mediaEl]
    const shouldUseClickToggle = activeMode === 'click' || (activeMode === 'autoplay' && toggleElements.length)

    let isInView = false
    let isHovering = false
    let hasLoaded = false
    let userPaused = false
    let userActivated = false
    let isActivated = false
    let shouldBePlaying = false
    let pauseTimer = null

    const setStatus = status => {
      mediaEl.dataset.mediaStatus = status
    }

    const clearPauseTimer = () => {
      clearTimeout(pauseTimer)
    }

    const addCleanup = fn => {
      cleanupFns.push(fn)
    }

    const on = (target, event, handler) => {
      target.addEventListener(event, handler)
      addCleanup(() => target.removeEventListener(event, handler))
    }

    const playAttempt = () => {
      video.play().then(() => {
        if (shouldBePlaying) setStatus('playing')
      }).catch(() => {})
    }

    const loadVideo = () => {
      if (hasLoaded) return

      const src = video.dataset.mediaVideoSrc
      if (!src) return

      video.muted = true
      video.playsInline = true
      video.preload = 'auto'
      video.setAttribute('muted', '')
      video.setAttribute('playsinline', '')
      video.setAttribute('webkit-playsinline', '')
      video.setAttribute('fetchpriority', 'high')
      video.src = src
      video.load()
      hasLoaded = true
    }

    const shouldResume = () => {
      if (!isInView || document.hidden) return false
      if (activeMode === 'autoplay') return !userPaused
      if (activeMode === 'click') return userActivated && !userPaused
      return isHovering
    }

    const playVideo = () => {
      if (!isInView || document.hidden) return

      shouldBePlaying = true
      clearPauseTimer()
      loadVideo()
      setStatus(video.readyState < 3 ? 'loading' : 'playing')
      playAttempt()
    }

    const pauseVideo = (delay = 0, reset = false) => {
      shouldBePlaying = false
      clearPauseTimer()

      pauseTimer = setTimeout(() => {
        video.pause()
        if (reset) video.currentTime = 0
      }, delay)
    }

    const handleHoverIn = () => {
      if (!isInView || document.hidden) return

      isHovering = true
      clearPauseTimer()

      if (!video.paused) {
        shouldBePlaying = true
        setStatus('playing')
        return
      }

      playVideo()
    }

    const handleHoverOut = () => {
      if (!isInView) return

      isHovering = false
      setStatus(pausedStatus)
      pauseVideo(pauseDelay, shouldResetOnPause)
    }

    const handleClick = () => {
      if (!isInView || document.hidden) return

      clearPauseTimer()

      if (video.paused) {
        userActivated = true
        userPaused = false
        playVideo()
      } else {
        userActivated = true
        userPaused = true
        setStatus(pausedStatus)
        pauseVideo(pauseDelay, shouldResetOnPause)
      }
    }

    const handleViewport = entries => {
      entries.forEach(entry => {
        if (entry.target !== mediaEl) return

        if (!isActivated && entry.isIntersecting) {
          isActivated = true

          if (shouldUseClickToggle) {
            clickTargets.forEach(toggleEl => on(toggleEl, 'click', handleClick))
          }

          if (activeMode === 'hover') {
            on(mediaEl, 'mouseenter', handleHoverIn)
            on(mediaEl, 'mouseleave', handleHoverOut)
          }
        }

        isInView = entry.isIntersecting

        if (isInView) {
          if (shouldResume()) playVideo()
        } else {
          isHovering = false

          if (!video.paused || shouldBePlaying) {
            setStatus('paused')
            pauseVideo(0, false)
          }
        }
      })
    }

    const handlePageVisibilityChange = () => {
      if (document.hidden) {
        if (!video.paused || shouldBePlaying) {
          setStatus('paused')
          pauseVideo(0, false)
        }
        return
      }
      if (shouldResume()) playVideo()
    }

    mediaEl.dataset.mediaStatus = 'not-active'

    const observer = new IntersectionObserver(handleViewport, {
      rootMargin: `${rootMarginValue}% 0px ${rootMarginValue}% 0px`,
      threshold: 0
    })

    observer.observe(mediaEl)

    on(video, 'playing', () => { if (shouldBePlaying) setStatus('playing') })
    on(video, 'waiting', () => { if (shouldBePlaying) setStatus('loading') })
    on(video, 'canplay', () => { if (shouldBePlaying && isInView && !document.hidden) playAttempt() })
    on(video, 'loadeddata', () => { if (shouldBePlaying && isInView && !document.hidden) playAttempt() })
    on(video, 'ended', () => {
      if (!shouldBePlaying || !isInView || document.hidden) return
      video.currentTime = 0
      playAttempt()
    })

    on(document, 'visibilitychange', handlePageVisibilityChange)

    addCleanup(() => observer.disconnect())
    addCleanup(() => {
      clearPauseTimer()
      shouldBePlaying = false
      video.pause()
    })
  })

  initMediaSetup._cleanup = cleanupFns
}

// Initialize Cover Media Setup (Autoplay, Click, Hover)
// main.js loads asynchronously via the fxtun/jsDelivr loader, so DOMContentLoaded
// has often already fired by the time this runs — only wait for it if needed
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initMediaSetup)
} else {
  initMediaSetup()
}

// ============================================
// COPY TO CLIPBOARD
// ============================================

function initCopyToClipboard() {
  document.querySelectorAll('[data-text="copy"]').forEach(el => {
    el.addEventListener('click', () => {
      // textContent pulls only text nodes, skipping SVG/other markup
      const text = el.textContent.trim().replace(/\s+/g, ' ')

      navigator.clipboard.writeText(text)
        .then(() => console.log('Copied:', text))
        .catch(err => console.error('Copy failed:', err))
    })
  })
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initCopyToClipboard)
} else {
  initCopyToClipboard()
}

// ============================================
// COLOR THEME SCROLL ANIMATIONS
// ============================================

function initThemeScrollAnimations() {
  const sections = document.querySelectorAll('[data-animate-theme-to]')

  sections.forEach((el, index) => {
    const theme = el.dataset.animateThemeTo
    // since sections sit back-to-back with no gap, scrolling back up out of
    // this section means you're back in the one right before it
    const previousTheme = index > 0 ? sections[index - 1].dataset.animateThemeTo : null

    ScrollTrigger.create({
      trigger: el,
      start: 'top 80%', // fires once 20% of the section has scrolled into view
      onEnter: () => gsap.to('body', { ...window.colorThemes.getTheme(theme) }),
      onLeaveBack: () => {
        if (previousTheme) gsap.to('body', { ...window.colorThemes.getTheme(previousTheme) })
      }
    })
  })
}

// main.js loads asynchronously, so the theme-collector script's 'colorThemesReady'
// event (fired on the page's DOMContentLoaded) has often already happened by the
// time we get here — if themes are already populated, just run immediately
if (window.colorThemes?.themes && Object.keys(window.colorThemes.themes).length) {
  initThemeScrollAnimations()
} else {
  document.addEventListener('colorThemesReady', initThemeScrollAnimations)
}

// Videos/images inside the page can still be loading when the triggers above
// are first measured, which shifts section positions afterward and throws off
// the trigger zones (most noticeable scrolling back up through stale ones).
// Re-measuring once everything has fully loaded keeps them accurate.
if (document.readyState === 'complete') {
  refreshScrollTrigger()
} else {
  window.addEventListener('load', refreshScrollTrigger)
}

// ============================================
// SIDE PANEL MODAL
// ============================================

function initSidePanel() {
  const panel = document.querySelector('[side-panel-wrapper="true"]')
  if (!panel) return

  const overlay = document.querySelector('[side-panel-overlay="true"]')
  const panelBox = document.querySelector('[side-panel-box="true"]')
  const panelScroll = document.querySelector('[side-panel-scroll="true"]')
  const openTriggers = document.querySelectorAll('[side-panel="true"]')
  const closeTriggers = document.querySelectorAll('[side-panel-close="true"]')

  gsap.set(panel, { autoAlpha: 1 })
  if (panelBox) gsap.set(panelBox, { xPercent: 105 })

  // fade the overlay's tint, not its opacity, so the panel box nested inside it isn't affected
  let overlayVisibleColor = null
  let overlayHiddenColor = null
  if (overlay) {
    const [r, g, b, a = 1] = getComputedStyle(overlay).backgroundColor.match(/[\d.]+/g)
    overlayVisibleColor = `rgba(${r}, ${g}, ${b}, ${a})`
    overlayHiddenColor = `rgba(${r}, ${g}, ${b}, 0)`
    gsap.set(overlay, { backgroundColor: overlayHiddenColor })
  }

  const openPanel = () => {
    window.lenis?.stop()
    gsap.set(panel, { display: 'block' })
    if (panelScroll) panelScroll.scrollTop = 0

    const tl = gsap.timeline()
    if (overlay) tl.to(overlay, { backgroundColor: overlayVisibleColor, duration: 0.5, ease: 'power1.out' }, 0)
    if (panelBox) tl.to(panelBox, { xPercent: 0, duration: 0.4, ease: 'power2.out' }, 0)
  }

  const closePanel = () => {
    window.lenis?.start()

    const tl = gsap.timeline({ onComplete: () => gsap.set(panel, { display: 'none' }) })
    if (overlay) tl.to(overlay, { backgroundColor: overlayHiddenColor, duration: 0.5, ease: 'power1.out' }, 0)
    if (panelBox) tl.to(panelBox, { xPercent: 105, duration: 0.4, ease: 'power2.out' }, 0)
  }

  openTriggers.forEach(trigger => trigger.addEventListener('click', openPanel))

  // only close if the click landed directly on the trigger, not something bubbling up from inside it
  closeTriggers.forEach(trigger => {
    trigger.addEventListener('click', e => {
      if (e.target !== trigger) return
      closePanel()
    })
  })
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSidePanel)
} else {
  initSidePanel()
}

// ============================================
// FLOATING NAV ON SCROLL
// ============================================

function initFloatingNav() {
  const navBar = document.querySelector('[data-nav-bar]')
  const navLogo = document.querySelector('[data-nav-logo]')
  if (!navBar) return

  ScrollTrigger.create({
    trigger: document.body,
    start: 'top -24', // fires once the page has scrolled 24px down
    end: 99999,
    toggleClass: { targets: [navBar, navLogo].filter(Boolean), className: 'nav-scrolled' }
  })
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initFloatingNav)
} else {
  initFloatingNav()
}