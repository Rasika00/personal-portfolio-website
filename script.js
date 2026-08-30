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

  // Preload frames progressively
  function preloadImages() {
    for (let i = 1; i <= TOTAL_FRAMES; i++) {
      const img = new Image();
      img.src = getFramePath(i);

      img.onload = () => {
        images[i - 1] = img;
        loadedCount++;

        // Draw initial frame immediately once frame 1 is ready
        if (i === 1 && !isInitialReady) {
          resizeCanvas();
          renderFrame(0);
        }

        // Once initial batch is ready, dismiss preloader
        if (loadedCount >= 4 && !isInitialReady) {
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
        if (loadedCount === TOTAL_FRAMES) {
          dismissLoader();
        }
      };
    }
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

  // Initialize
  function init() {
    resizeCanvas();
    preloadImages();
    updateScrollProgress();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
