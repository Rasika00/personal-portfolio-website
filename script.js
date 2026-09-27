/**
 * High-Performance Smooth Scroll Frame Animation Engine
 * Synchronized with multi-section layout and glassmorphic UI
 */

(function () {
  'use strict';

  // Configuration
  const TOTAL_FRAMES = 180;
  const FRAME_PREFIX = 'frames/ezgif-frame-';
  const FRAME_EXTENSION = '.jpg';
  const LERP_FACTOR = 0.24; // Fast, responsive tracking that snaps cleanly on stop

  // DOM Elements
  const canvas = document.getElementById('animation-canvas');
  const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
  const loader = document.getElementById('loader');
  const progressRing = document.getElementById('progress-ring');
  const progressText = document.getElementById('progress-text');
  const progressBar = document.getElementById('scroll-bar');
  const navbar = document.querySelector('.navbar');

  // Image Cache & Network Queue State
  const images = new Array(TOTAL_FRAMES);
  let loadedCount = 0;
  let isInitialReady = false;
  const RING_CIRCUMFERENCE = 2 * Math.PI * 42;

  // Controlled Concurrency Worker Pool
  const MAX_CONCURRENT_DOWNLOADS = 8;
  let activeDownloads = 0;
  const loadQueue = [];
  const queuedSet = new Set();
  const loadedSet = new Set();
  const activeSet = new Set();
  let lastReprioritizedFrame = -1;

  // Animation State
  let targetProgress = 0;
  let currentProgress = 0;
  let lastRenderedIndex = -1;
  let lastRenderedWasExact = false;
  let isLoopRunning = false;
  let resizeTimeout = null;
  let scrollStopTimer = null;

  // Format frame path: 1 -> "frames/ezgif-frame-001.jpg"
  function getFramePath(index) {
    const padded = String(index).padStart(3, '0');
    return `${FRAME_PREFIX}${padded}${FRAME_EXTENSION}`;
  }

  // Queue frame helper
  function queueFrame(frameNum) {
    if (frameNum < 1 || frameNum > TOTAL_FRAMES) return;
    if (loadedSet.has(frameNum) || queuedSet.has(frameNum)) return;
    queuedSet.add(frameNum);
    loadQueue.push(frameNum);
  }

  // Urgently prioritize and load a specific frame right away
  function urgentLoadFrame(frameNum) {
    if (frameNum < 1 || frameNum > TOTAL_FRAMES) return;
    if (loadedSet.has(frameNum)) return;

    // Move to front of queue if already present
    const idx = loadQueue.indexOf(frameNum);
    if (idx > -1) {
      loadQueue.splice(idx, 1);
    } else {
      queuedSet.add(frameNum);
    }
    loadQueue.unshift(frameNum);

    // If already downloading, wait for it
    if (activeSet.has(frameNum)) return;

    // Immediately trigger download
    if (activeDownloads < MAX_CONCURRENT_DOWNLOADS) {
      processQueue();
    } else {
      // Force start this frame as high priority
      loadQueue.shift();
      queuedSet.delete(frameNum);
      activeDownloads++;
      loadSingleFrame(frameNum);
    }
  }

  // Generate initial distribution across entire timeline
  function initLoadQueue() {
    // Priority 1: Key storytelling frames immediately!
    [1, 25, 114, 142, 180].forEach(queueFrame);

    // Priority 2: Distributed keyframes across entire scroll journey (every 6 frames)
    for (let i = 6; i <= TOTAL_FRAMES; i += 6) {
      queueFrame(i);
    }
    queueFrame(TOTAL_FRAMES);

    // Priority 3: Midpoints (every 3 frames)
    for (let i = 3; i <= TOTAL_FRAMES; i += 3) {
      queueFrame(i);
    }

    // Priority 4: All remaining frames to reach full 60fps fidelity
    for (let i = 1; i <= TOTAL_FRAMES; i++) {
      queueFrame(i);
    }

    processQueue();
  }

  // Reprioritize queue dynamically around current scroll position
  function reprioritizeQueue(targetFrame) {
    if (!loadQueue.length) return;
    if (targetFrame === lastReprioritizedFrame) return;
    lastReprioritizedFrame = targetFrame;

    loadQueue.sort((a, b) => Math.abs(a - targetFrame) - Math.abs(b - targetFrame));
    processQueue();
  }

  function processQueue() {
    while (activeDownloads < MAX_CONCURRENT_DOWNLOADS && loadQueue.length > 0) {
      const frameNum = loadQueue.shift();
      queuedSet.delete(frameNum);
      if (loadedSet.has(frameNum)) continue;

      activeDownloads++;
      loadSingleFrame(frameNum);
    }
  }

  function loadSingleFrame(frameNum) {
    activeSet.add(frameNum);
    const img = new Image();
    img.src = getFramePath(frameNum);

    const onComplete = async () => {
      // Decode image off the main thread so drawing never stutters
      if ('decode' in img) {
        try {
          await img.decode();
        } catch (_) {}
      }

      img._ready = true;
      images[frameNum - 1] = img;
      loadedSet.add(frameNum);
      activeSet.delete(frameNum);
      loadedCount++;

      // Instant reveal: Render Frame 1 immediately and dismiss loader
      if (frameNum === 1 && !isInitialReady) {
        resizeCanvas();
        drawFrameToCanvas(0, true);
        isInitialReady = true;
        dismissLoader();
      }

      // If initial 3 keyframes are ready, dismiss loader so visitor never waits
      if (loadedCount >= 3 && !isInitialReady) {
        isInitialReady = true;
        dismissLoader();
      }

      updateLoaderProgress();
      activeDownloads--;

      // EXACT STOP FRAME UPGRADE:
      // When this frame finishes loading, check if the user is currently resting on it
      // or if the canvas is currently displaying an imprecise fallback neighbor.
      // If so, instantly re-render with this crisp, exact frame!
      const currentTargetIndex = Math.min(
        TOTAL_FRAMES - 1,
        Math.max(0, Math.round(targetProgress * (TOTAL_FRAMES - 1)))
      );

      if (frameNum - 1 === currentTargetIndex || (!lastRenderedWasExact && Math.abs(frameNum - 1 - currentTargetIndex) < Math.abs(lastRenderedIndex - currentTargetIndex))) {
        drawFrameToCanvas(currentTargetIndex, true);
      }

      processQueue();
    };

    img.onload = onComplete;
    img.onerror = () => {
      loadedSet.add(frameNum);
      activeSet.delete(frameNum);
      activeDownloads--;
      processQueue();
    };
  }

  function updateLoaderProgress() {
    const percent = Math.min(100, Math.floor((loadedCount / TOTAL_FRAMES) * 100));
    const offset = RING_CIRCUMFERENCE - (percent / 100) * RING_CIRCUMFERENCE;
    
    if (progressRing) {
      progressRing.style.strokeDashoffset = offset;
    }
    if (progressText) {
      progressText.textContent = `${percent}%`;
    }
  }

  function dismissLoader() {
    if (loader && !loader.classList.contains('hidden')) {
      loader.classList.add('hidden');
    }
    startAnimationLoop();
  }

  // Canvas Sizing with Aspect-Ratio-Aware Cover Geometry and Pixel-Perfect DPR
  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const displayWidth = window.innerWidth;
    const displayHeight = window.innerHeight;

    const targetWidth = Math.round(displayWidth * dpr);
    const targetHeight = Math.round(displayHeight * dpr);

    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    if (lastRenderedIndex >= 0) {
      drawFrameToCanvas(lastRenderedIndex, true);
    } else {
      drawFrameToCanvas(0, true);
    }
  }

  // Find nearest loaded image if target frame is still downloading
  function getBestFrame(targetIndex) {
    if (images[targetIndex] && images[targetIndex]._ready) {
      return { img: images[targetIndex], index: targetIndex, isExact: true };
    }

    // Search outwards for nearest loaded frame
    for (let offset = 1; offset < TOTAL_FRAMES; offset++) {
      const prev = targetIndex - offset;
      if (prev >= 0 && images[prev] && images[prev]._ready) {
        return { img: images[prev], index: prev, isExact: false };
      }
      const next = targetIndex + offset;
      if (next < TOTAL_FRAMES && images[next] && images[next]._ready) {
        return { img: images[next], index: next, isExact: false };
      }
    }
    return null;
  }

  // Draw frame to canvas with centered cover geometry (zero redundant full-screen clears)
  function drawFrameToCanvas(frameIndex, forceRedraw = false) {
    const match = getBestFrame(frameIndex);
    if (!match) return;

    // Skip redundant drawing only if already showing this exact frame and not forced
    if (!forceRedraw && lastRenderedIndex === frameIndex && lastRenderedWasExact) {
      return;
    }

    const img = match.img;
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    if (canvasWidth === 0 || canvasHeight === 0) return;

    const imgWidth = img.naturalWidth || 1600;
    const imgHeight = img.naturalHeight || 900;

    const canvasAspect = canvasWidth / canvasHeight;
    const imgAspect = imgWidth / imgHeight;

    let drawWidth, drawHeight, offsetX, offsetY;

    if (canvasAspect > imgAspect) {
      drawWidth = canvasWidth;
      drawHeight = canvasWidth / imgAspect;
      offsetX = 0;
      offsetY = (canvasHeight - drawHeight) / 2;
    } else {
      drawHeight = canvasHeight;
      drawWidth = canvasHeight * imgAspect;
      offsetX = (canvasWidth - drawWidth) / 2;
      offsetY = 0;
    }

    // Integer rounding eliminates subpixel anti-aliasing blur
    const dX = Math.round(offsetX);
    const dY = Math.round(offsetY);
    const dW = Math.round(drawWidth);
    const dH = Math.round(drawHeight);

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.drawImage(img, dX, dY, dW, dH);

    lastRenderedIndex = match.index;
    lastRenderedWasExact = match.isExact;
  }

  function renderFrame(frameIndex) {
    drawFrameToCanvas(frameIndex);
  }

  // Normalize resting frame when stopping: avoids awkward transitional frames (eye-roll or blink)
  function getCleanRestingFrame(frameNum) {
    // Range 1: Frames 6 to 18 (eyes rolling sideways / mouth half-turned)
    if (frameNum >= 6 && frameNum <= 18) {
      return frameNum <= 11 ? 1 : 22;
    }
    // Range 2: Frames 123 to 127 (eyes closed in blink)
    if (frameNum >= 123 && frameNum <= 127) {
      return 130;
    }
    return frameNum;
  }

  // Exact snap when scroll pauses or finishes
  function onScrollStop() {
    const rawFrame = Math.min(
      TOTAL_FRAMES,
      Math.max(1, Math.round(targetProgress * (TOTAL_FRAMES - 1)) + 1)
    );

    // Sanitize frame so user never rests on an awkward moment
    const cleanFrame = getCleanRestingFrame(rawFrame);
    targetProgress = (cleanFrame - 1) / (TOTAL_FRAMES - 1);
    currentProgress = targetProgress;

    const frameIdx = cleanFrame - 1;

    // Urgently load the exact frame and its immediate neighbors
    urgentLoadFrame(cleanFrame);
    if (cleanFrame > 1) urgentLoadFrame(cleanFrame - 1);
    if (cleanFrame < TOTAL_FRAMES) urgentLoadFrame(cleanFrame + 1);

    // Force draw the clean frame
    drawFrameToCanvas(frameIdx, true);

    isLoopRunning = false;
  }

  // Update target progress from window scroll position (Desktop & Mobile)
  function updateScrollProgress() {
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
    const maxScroll = (document.documentElement.scrollHeight || document.body.scrollHeight) - window.innerHeight;

    if (maxScroll <= 0) {
      targetProgress = 0;
      return;
    }

    const rawProgress = Math.max(0, Math.min(1, scrollTop / maxScroll));

    // Hero Comfort Deadzone:
    // For the initial reading zone of the hero section (~3.5% of total page scroll),
    // hold Frame 1 active so Rasika looks directly at the visitor with eye contact.
    // Beyond that, seamlessly map across all 180 frames for fluid 60fps continuous animation!
    const HERO_DEADZONE = 0.035;
    let animatedProgress = 0;
    if (rawProgress > HERO_DEADZONE) {
      animatedProgress = (rawProgress - HERO_DEADZONE) / (1 - HERO_DEADZONE);
    }

    targetProgress = animatedProgress;

    const currentTargetFrame = Math.min(
      TOTAL_FRAMES,
      Math.max(1, Math.round(targetProgress * (TOTAL_FRAMES - 1)) + 1)
    );
    reprioritizeQueue(currentTargetFrame);

    if (navbar) {
      navbar.classList.toggle('scrolled', scrollTop > 20);
    }

    if (progressBar) {
      progressBar.style.width = `${(rawProgress * 100).toFixed(2)}%`;
    }

    startAnimationLoop();

    // Settle cleanly when scroll stops
    clearTimeout(scrollStopTimer);
    scrollStopTimer = setTimeout(onScrollStop, 90);
  }

  // RAF Lerp Loop
  function tick() {
    const delta = targetProgress - currentProgress;

    // Smooth, responsive tracking
    if (Math.abs(delta) < 0.0003) {
      currentProgress = targetProgress;
      const exactFrame = Math.min(
        TOTAL_FRAMES - 1,
        Math.max(0, Math.round(currentProgress * (TOTAL_FRAMES - 1)))
      );
      drawFrameToCanvas(exactFrame, !lastRenderedWasExact);
      isLoopRunning = false;
      return;
    }

    currentProgress += delta * LERP_FACTOR;

    const frameIndex = Math.min(
      TOTAL_FRAMES - 1,
      Math.max(0, Math.round(currentProgress * (TOTAL_FRAMES - 1)))
    );

    if (frameIndex !== lastRenderedIndex || !lastRenderedWasExact) {
      drawFrameToCanvas(frameIndex);
    }

    requestAnimationFrame(tick);
  }

  function startAnimationLoop() {
    if (!isLoopRunning) {
      isLoopRunning = true;
      requestAnimationFrame(tick);
    }
  }

  // Event Listeners: Full Desktop & Mobile Touch Support
  window.addEventListener('scroll', updateScrollProgress, { passive: true });
  window.addEventListener('touchmove', updateScrollProgress, { passive: true });
  if ('onscrollend' in window) {
    window.addEventListener('scrollend', onScrollStop, { passive: true });
  }

  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      resizeCanvas();
      updateScrollProgress();
    }, 50);
  }, { passive: true });

  window.addEventListener('load', () => {
    resizeCanvas();
    updateScrollProgress();
  });

  // Smooth keyboard navigation support
  window.addEventListener('keydown', (e) => {
    if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End'].includes(e.key)) {
      startAnimationLoop();
    }
  });

  // Interactive Tech Stack Accordion (Topic Selector)
  function initTechAccordion() {
    const accordion = document.getElementById('techAccordion');
    if (!accordion) return;

    const items = accordion.querySelectorAll('.accordion-item');

    items.forEach((item) => {
      const trigger = item.querySelector('.accordion-trigger');
      if (!trigger) return;

      trigger.addEventListener('click', (e) => {
        e.preventDefault();
        const isOpen = item.classList.contains('active');

        // Close all other items to keep view clean and balanced
        items.forEach((other) => {
          if (other !== item) {
            other.classList.remove('active');
            const otherTrigger = other.querySelector('.accordion-trigger');
            if (otherTrigger) {
              otherTrigger.setAttribute('aria-expanded', 'false');
            }
          }
        });

        // Toggle the clicked topic
        if (isOpen) {
          item.classList.remove('active');
          trigger.setAttribute('aria-expanded', 'false');
        } else {
          item.classList.add('active');
          trigger.setAttribute('aria-expanded', 'true');
        }
      });
    });
  }

  // Honors & Sports Modal Popup
  function initSportsModal() {
    const modal = document.getElementById('sportsModal');
    const openCard = document.getElementById('openSportsModalBtn');
    const closeBtn = document.getElementById('closeSportsModalBtn');
    const closeFooterBtn = document.getElementById('closeSportsModalFooterBtn');

    if (!modal) return;

    function openModal(e) {
      if (e) e.preventDefault();
      if (typeof modal.showModal === 'function') {
        modal.showModal();
      } else {
        modal.setAttribute('open', '');
      }
      document.body.style.overflow = 'hidden';
    }

    function closeModal(e) {
      if (e) e.preventDefault();
      if (typeof modal.close === 'function') {
        modal.close();
      } else {
        modal.removeAttribute('open');
      }
      document.body.style.overflow = '';
    }

    if (openCard) {
      openCard.addEventListener('click', openModal);
      openCard.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          openModal(e);
        }
      });
    }

    // Support additional modal triggers (from Recognition/Leadership sections)
    const extraTriggers = document.querySelectorAll('[data-open-sports-modal], .open-sports-modal-trigger');
    extraTriggers.forEach((trigger) => {
      if (trigger !== openCard) {
        trigger.addEventListener('click', openModal);
        trigger.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            openModal(e);
          }
        });
      }
    });

    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (closeFooterBtn) closeFooterBtn.addEventListener('click', closeModal);

    // Close when clicking backdrop
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeModal(e);
      }
    });

    // Restore scroll on native close / cancel
    modal.addEventListener('close', () => {
      document.body.style.overflow = '';
    });

    modal.addEventListener('cancel', () => {
      document.body.style.overflow = '';
    });
  }

  // Technical Certificates Category Filter
  function initCertFilters() {
    const filterButtons = document.querySelectorAll('.cert-filter-btn');
    const cards = document.querySelectorAll('#certGrid .cert-card');

    if (!filterButtons.length || !cards.length) return;

    filterButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        filterButtons.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');

        const filter = btn.getAttribute('data-cert-filter');

        cards.forEach((card) => {
          const categoryStr = card.getAttribute('data-category') || '';
          const categories = categoryStr.trim().split(/\s+/);
          if (filter === 'all' || categories.includes(filter)) {
            card.style.display = 'flex';
            card.style.animation = 'fadeInCert 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards';
          } else {
            card.style.display = 'none';
          }
        });
      });
    });
  }

  // Floating Toast Notification
  function showToast(msg, duration = 3500) {
    const toastEl = document.getElementById('toast');
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('on');
    if (toastEl._timeout) clearTimeout(toastEl._timeout);
    toastEl._timeout = setTimeout(() => {
      toastEl.classList.remove('on');
    }, duration);
  }

  // Interactive Contact Form (Dinusha-style with Dual Email Delivery & Mailto Fallback)
  function initContactForm() {
    const form = document.getElementById('contactForm');
    const nameInput = document.getElementById('cN');
    const emailInput = document.getElementById('cE');
    const subjectInput = document.getElementById('cS');
    const messageInput = document.getElementById('cM');
    const btn = document.getElementById('sendBtn');
    const status = document.getElementById('formStatus');

    if (!form || !btn) return;

    const PRIMARY_EMAIL = 'rasikapriyanath62@gmail.com';
    const CC_EMAIL = 'itt2023097@tec.rjt.ac.lk';

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const name = nameInput ? nameInput.value.trim() : '';
      const email = emailInput ? emailInput.value.trim() : '';
      const subject = subjectInput ? subjectInput.value.trim() : '';
      const message = messageInput ? messageInput.value.trim() : '';

      if (!name || !email || !message) {
        showToast('Please fill in your Name, Email & Message');
        return;
      }

      // Visual sending state
      const originalBtnHTML = btn.innerHTML;
      btn.innerHTML = `<span>Sending...</span><div class="btn-arrow-circle"><span class="spin-dot">●</span></div>`;
      btn.disabled = true;
      if (status) {
        status.style.display = 'none';
        status.className = 'form-status-alert';
      }

      const emailSubject = subject || `Portfolio Contact from ${name}`;
      const mailtoUrl = `mailto:${PRIMARY_EMAIL}?cc=${encodeURIComponent(CC_EMAIL)}&subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(`Hi Rasika,\n\nName: ${name}\nEmail: ${email}\n\nMessage:\n${message}\n`)}`;

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        const response = await fetch(`https://formsubmit.co/ajax/${PRIMARY_EMAIL}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({
            name: name,
            email: email,
            _subject: emailSubject,
            _cc: CC_EMAIL,
            message: message,
            _template: 'box'
          }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        const data = await response.json().catch(() => ({}));

        if (response.ok && (data.success === 'true' || data.success === true || response.status === 200)) {
          if (status) {
            status.textContent = "✓ Message sent successfully! I'll get back to you soon.";
            status.className = 'form-status-alert success';
            status.style.display = 'block';
          }
          form.reset();
          showToast('Message Sent Successfully ✓');
        } else {
          // If response not OK or requires manual client fallback
          throw new Error('Service response not OK');
        }
      } catch (err) {
        // Fallback directly to mailto
        if (status) {
          status.innerHTML = `Opening your email app to send directly to <strong>${PRIMARY_EMAIL}</strong> &amp; <strong>${CC_EMAIL}</strong>...`;
          status.className = 'form-status-alert info';
          status.style.display = 'block';
        }
        showToast('Connecting to your email app...');
        setTimeout(() => {
          window.location.href = mailtoUrl;
        }, 600);
      } finally {
        btn.innerHTML = originalBtnHTML;
        btn.disabled = false;
      }
    });
  }

  // Initialize
  function init() {
    resizeCanvas();
    initLoadQueue();
    updateScrollProgress();
    initTechAccordion();
    initSportsModal();
    initCertFilters();
    initContactForm();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
