/**
 * High-Performance Smooth Scroll Frame Animation Engine
 * Synchronized with multi-section layout and glassmorphic UI
 */

(function () {
  'use strict';

  // Configuration
  const TOTAL_FRAMES = 180;
  const FRAME_PREFIX = 'frames/ezgif-frame-';
  const FRAME_EXTENSION = '.png';
  const LERP_FACTOR = 0.095; // Buttery smooth momentum

  // DOM Elements
  const canvas = document.getElementById('animation-canvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  const loader = document.getElementById('loader');
  const progressRing = document.getElementById('progress-ring');
  const progressText = document.getElementById('progress-text');
  const progressBar = document.getElementById('scroll-bar');
  const navbar = document.querySelector('.navbar');

  // Image Cache
  const images = new Array(TOTAL_FRAMES);
  let loadedCount = 0;
  let isInitialReady = false;
  const RING_CIRCUMFERENCE = 2 * Math.PI * 42;

  // Animation State
  let targetProgress = 0;
  let currentProgress = 0;
  let lastRenderedFrame = -1;
  let isLoopRunning = false;
  let resizeTimeout = null;

  // Format frame path: 1 -> "frames/ezgif-frame-001.png"
  function getFramePath(index) {
    const padded = String(index).padStart(3, '0');
    return `${FRAME_PREFIX}${padded}${FRAME_EXTENSION}`;
  }

  // Generate prioritized frame loading order: Keyframes first across the entire timeline, then midpoints, then remaining
  function getPreloadOrder() {
    const order = [];
    const added = new Set();

    function addFrame(i) {
      if (i >= 1 && i <= TOTAL_FRAMES && !added.has(i)) {
        added.add(i);
        order.push(i);
      }
    }

    // Always start with the first frame
    addFrame(1);

    // Tier 1: Major key checkpoints distributed across entire scroll journey (every 10 frames)
    for (let i = 10; i <= TOTAL_FRAMES; i += 10) {
      addFrame(i);
    }
    addFrame(TOTAL_FRAMES);

    // Tier 2: Midpoints for fluid transitions (every 5 frames)
    for (let i = 5; i <= TOTAL_FRAMES; i += 5) {
      addFrame(i);
    }

    // Tier 3: All remaining frames to reach full 60fps fidelity
    for (let i = 1; i <= TOTAL_FRAMES; i++) {
      addFrame(i);
    }

    return order;
  }

  // Preload frames progressively with priority-first streaming
  function preloadImages() {
    const order = getPreloadOrder();
    const KEY_BATCH_THRESHOLD = 12;

    order.forEach((frameNum) => {
      const img = new Image();
      img.src = getFramePath(frameNum);

      img.onload = () => {
        images[frameNum - 1] = img;
        loadedCount++;

        // Draw initial frame immediately once frame 1 is ready
        if (frameNum === 1 && !isInitialReady) {
          resizeCanvas();
          renderFrame(0);
        }

        // Once key checkpoints across the page are ready, dismiss preloader for instant interaction
        if (loadedCount >= KEY_BATCH_THRESHOLD && !isInitialReady) {
          isInitialReady = true;
          dismissLoader();
        }

        updateLoaderProgress();

        if (loadedCount === TOTAL_FRAMES) {
          dismissLoader();
        }
      };

      img.onerror = () => {
        loadedCount++;
        updateLoaderProgress();
        if (loadedCount >= KEY_BATCH_THRESHOLD && !isInitialReady) {
          isInitialReady = true;
          dismissLoader();
        }
        if (loadedCount === TOTAL_FRAMES) {
          dismissLoader();
        }
      };
    });
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

  // Canvas Sizing with Aspect-Ratio-Aware Cover Geometry
  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const displayWidth = window.innerWidth;
    const displayHeight = window.innerHeight;

    canvas.width = Math.floor(displayWidth * dpr);
    canvas.height = Math.floor(displayHeight * dpr);

    if (lastRenderedFrame >= 0) {
      drawFrameToCanvas(lastRenderedFrame);
    } else {
      drawFrameToCanvas(0);
    }
  }

  // Find nearest loaded image if target frame is still downloading
  function getBestFrame(targetIndex) {
    if (images[targetIndex] && images[targetIndex].complete && images[targetIndex].naturalWidth > 0) {
      return { img: images[targetIndex], index: targetIndex };
    }

    // Search outwards for nearest loaded frame
    for (let offset = 1; offset < TOTAL_FRAMES; offset++) {
      const prev = targetIndex - offset;
      if (prev >= 0 && images[prev] && images[prev].complete && images[prev].naturalWidth > 0) {
        return { img: images[prev], index: prev };
      }
      const next = targetIndex + offset;
      if (next < TOTAL_FRAMES && images[next] && images[next].complete && images[next].naturalWidth > 0) {
        return { img: images[next], index: next };
      }
    }
    return null;
  }

  // Draw frame to canvas with centered cover geometry
  function drawFrameToCanvas(frameIndex) {
    const match = getBestFrame(frameIndex);
    if (!match) return;

    const img = match.img;
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    const imgWidth = img.naturalWidth;
    const imgHeight = img.naturalHeight;

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

    ctx.fillStyle = '#060204';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
    lastRenderedFrame = frameIndex;
  }

  function renderFrame(frameIndex) {
    drawFrameToCanvas(frameIndex);
  }

  // Update target progress from window scroll position
  function updateScrollProgress() {
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
    const maxScroll = (document.documentElement.scrollHeight || document.body.scrollHeight) - window.innerHeight;

    if (maxScroll > 0) {
      targetProgress = Math.max(0, Math.min(1, scrollTop / maxScroll));
    } else {
      targetProgress = 0;
    }

    if (navbar) {
      navbar.classList.toggle('scrolled', scrollTop > 20);
    }

    startAnimationLoop();
  }

  // RAF Lerp Loop
  function tick() {
    const delta = targetProgress - currentProgress;
    currentProgress += delta * LERP_FACTOR;

    const frameIndex = Math.min(
      TOTAL_FRAMES - 1,
      Math.max(0, Math.round(currentProgress * (TOTAL_FRAMES - 1)))
    );

    if (frameIndex !== lastRenderedFrame) {
      drawFrameToCanvas(frameIndex);
    }

    if (progressBar) {
      progressBar.style.width = `${(currentProgress * 100).toFixed(2)}%`;
    }

    // Stop loop when resting to save CPU/GPU power
    if (Math.abs(delta) < 0.00015) {
      currentProgress = targetProgress;
      const finalFrame = Math.min(
        TOTAL_FRAMES - 1,
        Math.max(0, Math.round(currentProgress * (TOTAL_FRAMES - 1)))
      );
      if (finalFrame !== lastRenderedFrame) {
        drawFrameToCanvas(finalFrame);
      }
      isLoopRunning = false;
      return;
    }

    requestAnimationFrame(tick);
  }

  function startAnimationLoop() {
    if (!isLoopRunning) {
      isLoopRunning = true;
      requestAnimationFrame(tick);
    }
  }

  // Event Listeners
  window.addEventListener('scroll', updateScrollProgress, { passive: true });

  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      resizeCanvas();
      updateScrollProgress();
    }, 50);
  }, { passive: true });

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
    preloadImages();
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
