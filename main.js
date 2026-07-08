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
// BUNNY HLS BACKGROUND VIDEO PLAYER
// ============================================

/**
 * Set up background video players that stream from Bunny via HLS.
 * Handles lazy-loading, play/pause/mute controls, and pausing
 * automatically when a player scrolls out of view (when autoplay is on).
 */
function initBunnyPlayerBackground() {
  document.querySelectorAll('[data-bunny-background-init]').forEach((player) => {
    const src = player.getAttribute('data-player-src')
    if (!src) return

    const video = player.querySelector('video')
    if (!video) return

    try { video.pause() } catch (_) {}
    try { video.removeAttribute('src'); video.load() } catch (_) {}

    // Attribute helpers
    function setStatus(s) {
      if (player.getAttribute('data-player-status') !== s) {
        player.setAttribute('data-player-status', s)
      }
    }
    function setActivated(v) { player.setAttribute('data-player-activated', v ? 'true' : 'false') }
    if (!player.hasAttribute('data-player-activated')) setActivated(false)

    // Flags
    const lazyMode = player.getAttribute('data-player-lazy') // "true" | "false" (no meta)
    const isLazyTrue = lazyMode === 'true'
    const autoplay = player.getAttribute('data-player-autoplay') === 'true'
    const initialMuted = player.getAttribute('data-player-muted') === 'true'

    // Used to suppress 'ready' flicker when user just pressed play in lazy modes
    let pendingPlay = false

    // Autoplay forces muted + loop; the IntersectionObserver drives play/pause
    if (autoplay) { video.muted = true; video.loop = true }
    else { video.muted = initialMuted }

    video.setAttribute('muted', '')
    video.setAttribute('playsinline', '')
    video.setAttribute('webkit-playsinline', '')
    video.playsInline = true
    if (typeof video.disableRemotePlayback !== 'undefined') video.disableRemotePlayback = true
    if (autoplay) video.autoplay = false

    const isSafariNative = !!video.canPlayType('application/vnd.apple.mpegurl')
    const canUseHlsJs = !!(window.Hls && Hls.isSupported()) && !isSafariNative

    // Attach media only once (for actual playback)
    let isAttached = false
    let lastPauseBy = '' // 'io' | 'manual' | ''

    function attachMediaOnce() {
      if (isAttached) return
      isAttached = true

      if (player._hls) { try { player._hls.destroy() } catch (_) {} player._hls = null }

      if (isSafariNative) {
        video.preload = isLazyTrue ? 'none' : 'auto'
        video.src = src
        video.addEventListener('loadedmetadata', () => {
          readyIfIdle(player, pendingPlay)
        }, { once: true })
      } else if (canUseHlsJs) {
        const hls = new Hls({ maxBufferLength: 10 })
        hls.attachMedia(video)
        hls.on(Hls.Events.MEDIA_ATTACHED, () => { hls.loadSource(src) })
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          readyIfIdle(player, pendingPlay)
        })
        player._hls = hls
      } else {
        video.src = src
      }
    }

    // Initialize based on lazy mode
    if (isLazyTrue) {
      video.preload = 'none'
    } else {
      attachMediaOnce()
    }

    // Toggle play/pause
    function togglePlay() {
      if (video.paused || video.ended) {
        if (isLazyTrue && !isAttached) attachMediaOnce()
        pendingPlay = true
        lastPauseBy = ''
        setStatus('loading')
        safePlay(video)
      } else {
        lastPauseBy = 'manual'
        video.pause()
      }
    }

    // Toggle mute
    function toggleMute() {
      video.muted = !video.muted
      player.setAttribute('data-player-muted', video.muted ? 'true' : 'false')
    }

    // Controls (delegated)
    player.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-player-control]')
      if (!btn || !player.contains(btn)) return
      const type = btn.getAttribute('data-player-control')
      if (type === 'play' || type === 'pause' || type === 'playpause') togglePlay()
      else if (type === 'mute') toggleMute()
    })

    // Media event wiring
    video.addEventListener('play', () => { setActivated(true); setStatus('playing') })
    video.addEventListener('playing', () => { pendingPlay = false; setStatus('playing') })
    video.addEventListener('pause', () => { pendingPlay = false; setStatus('paused') })
    video.addEventListener('waiting', () => { setStatus('loading') })
    video.addEventListener('canplay', () => { readyIfIdle(player, pendingPlay) })
    video.addEventListener('ended', () => { pendingPlay = false; setStatus('paused'); setActivated(false) })

    // In-view auto play/pause (only when autoplay is true)
    if (autoplay) {
      if (player._io) { try { player._io.disconnect() } catch (_) {} }
      const io = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          const inView = entry.isIntersecting && entry.intersectionRatio > 0
          if (inView) {
            if (isLazyTrue && !isAttached) attachMediaOnce()
            if ((lastPauseBy === 'io') || (video.paused && lastPauseBy !== 'manual')) {
              setStatus('loading')
              if (video.paused) togglePlay()
              lastPauseBy = ''
            }
          } else {
            if (!video.paused && !video.ended) {
              lastPauseBy = 'io'
              video.pause()
            }
          }
        })
      }, { threshold: 0.1 })
      io.observe(player)
      player._io = io
    }
  })

  // Helper: ready status guard — only flip to "ready" if nothing else has claimed the state
  function readyIfIdle(player, pendingPlay) {
    if (!pendingPlay &&
        player.getAttribute('data-player-activated') !== 'true' &&
        player.getAttribute('data-player-status') === 'idle') {
      player.setAttribute('data-player-status', 'ready')
    }
  }

  // Helper: safe programmatic play (swallows the AbortError some browsers throw)
  function safePlay(video) {
    const p = video.play()
    if (p && typeof p.then === 'function') p.catch(() => {})
  }
}
window.initBunnyPlayerBackground = initBunnyPlayerBackground

// main.js loads asynchronously (via the fxtun/jsDelivr loader script), so
// DOMContentLoaded has often already fired by the time this file runs —
// only wait for it if the DOM genuinely isn't ready yet.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initBunnyPlayerBackground)
} else {
  initBunnyPlayerBackground()
}
