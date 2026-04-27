const CAT_VIDEO_URL = chrome.runtime.getURL('assets/neko1.webm');
const CAT_SLEEP_URL = chrome.runtime.getURL('assets/neko2.webm');

const preloadVideo = document.createElement('video');
preloadVideo.src = CAT_VIDEO_URL;
preloadVideo.preload = 'auto';
preloadVideo.muted = true;

const preloadSleep = document.createElement('video');
preloadSleep.src = CAT_SLEEP_URL;
preloadSleep.preload = 'auto';
preloadSleep.muted = true;

const preventScroll = (e) => e.preventDefault();

let catIsActive = false;
let trackerRunning = false;
let currentSeconds = 0;
let currentUsageLimit = 60;
let currentBreakTime = 5;

let stopTracker = () => {};
let stopCountdown = () => {};

chrome.storage.local.get({
  usageLimit: 60,
  breakTime: 5,
  accumulatedSeconds: 0,
  catState: 'idle',
  breakStartEpoch: 0,
}, (data) => {
  currentUsageLimit = data.usageLimit;
  currentBreakTime = data.breakTime;

  if (data.catState === 'break') {
    const elapsedSecs = Math.floor((Date.now() - data.breakStartEpoch) / 1000);
    const remainingSecs = Math.max(0, data.breakTime * 60 - elapsedSecs);

    if (remainingSecs <= 0) {
      chrome.storage.local.set({ catState: 'idle', accumulatedSeconds: 0 });
      startTracking(data.usageLimit, data.breakTime, 0);
    } else {
      catIsActive = true;
      showCat(data.breakTime, () => startTracking(currentUsageLimit, currentBreakTime, 0), remainingSecs);
    }
  } else {
    startTracking(data.usageLimit, data.breakTime, data.accumulatedSeconds);
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'GET_CAT_STATUS') {
    sendResponse({
      catIsActive,
      trackerRunning,
      currentSeconds,
      usageLimit: currentUsageLimit,
      hasFocus: document.hasFocus(),
      isHidden: document.hidden,
    });
    return;
  }

  if (message.type === 'UPDATE_SETTINGS') {
    const { settings } = message;
    currentUsageLimit = settings.usageLimit;
    currentBreakTime = settings.breakTime;
    if (!catIsActive) {
      startTracking(settings.usageLimit, settings.breakTime, currentSeconds);
    }
  }

  if (message.type === 'DISMISS_CAT') {
    const overlay = document.getElementById('cat-gatekeeper-overlay');
    if (!overlay) return;
    catIsActive = false;
    stopCountdown();
    chrome.storage.local.set({ catState: 'idle', accumulatedSeconds: 0 });
    overlay.style.transition = 'opacity 0.5s';
    overlay.style.opacity = '0';
    setTimeout(() => {
      overlay.remove();
      document.documentElement.style.overflow = '';
      document.removeEventListener('wheel', preventScroll);
      document.removeEventListener('touchmove', preventScroll);
      startTracking(currentUsageLimit, currentBreakTime, 0);
    }, 500);
  }
});

function startTracking(usageLimit, breakTime, initialSeconds) {
  stopTracker();
  currentUsageLimit = usageLimit;
  currentBreakTime = breakTime;
  trackerRunning = true;
  currentSeconds = initialSeconds;

  let ticksSinceLastSave = 0;

  const tracker = setInterval(() => {
    if (document.hidden || !document.hasFocus()) return;
    currentSeconds++;
    ticksSinceLastSave++;

    if (ticksSinceLastSave >= 5) {
      ticksSinceLastSave = 0;
      chrome.storage.local.set({ accumulatedSeconds: currentSeconds });
    }

    if (currentSeconds >= usageLimit * 60) {
      clearInterval(tracker);
      trackerRunning = false;
      catIsActive = true;
      chrome.storage.local.set({
        catState: 'break',
        breakStartEpoch: Date.now(),
        accumulatedSeconds: 0,
      });
      showCat(breakTime, () => startTracking(currentUsageLimit, currentBreakTime, 0));
    }
  }, 1000);

  stopTracker = () => {
    trackerRunning = false;
    clearInterval(tracker);
  };
}

function showCat(breakMinutes, onBreakEnd, initialCountdownSeconds) {
  const overlay = document.createElement('div');
  overlay.id = 'cat-gatekeeper-overlay';

  const countdown = document.createElement('div');
  countdown.id = 'cat-gatekeeper-countdown';
  let seconds = initialCountdownSeconds !== undefined ? initialCountdownSeconds : breakMinutes * 60;

  let countdownCancelled = false;
  stopCountdown = () => { countdownCancelled = true; };

  function updateCountdown() {
    if (countdownCancelled) return;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    countdown.textContent = `${m}:${String(s).padStart(2, '0')}`;
    if (seconds > 0) {
      seconds--;
      setTimeout(updateCountdown, 1000);
    } else {
      catIsActive = false;
      chrome.storage.local.set({ catState: 'idle', accumulatedSeconds: 0 });
      overlay.style.transition = 'opacity 1s';
      overlay.style.opacity = '0';
      setTimeout(() => {
        overlay.remove();
        document.documentElement.style.overflow = '';
        document.removeEventListener('wheel', preventScroll);
        document.removeEventListener('touchmove', preventScroll);
        onBreakEnd();
      }, 1000);
    }
  }
  updateCountdown();

  const video = document.createElement('video');
  video.src = CAT_VIDEO_URL;
  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;

  const videoSleep = document.createElement('video');
  videoSleep.src = CAT_SLEEP_URL;
  videoSleep.muted = true;
  videoSleep.playsInline = true;
  videoSleep.loop = true;
  videoSleep.style.display = 'none';

  overlay.appendChild(countdown);
  overlay.appendChild(video);
  overlay.appendChild(videoSleep);
  document.body.appendChild(overlay);
  document.documentElement.style.overflow = 'hidden';
  document.addEventListener('wheel', preventScroll, { passive: false });
  document.addEventListener('touchmove', preventScroll, { passive: false });

  document.querySelectorAll('video').forEach(v => {
    if (v !== video && v !== videoSleep) v.pause();
  });

  video.addEventListener('ended', () => {
    video.style.display = 'none';
    videoSleep.style.display = 'block';
    videoSleep.classList.add('sleeping');
    videoSleep.play();
  });
}
