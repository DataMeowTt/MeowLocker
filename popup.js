document.querySelectorAll('[data-i18n]').forEach(el => {
  el.textContent = chrome.i18n.getMessage(el.dataset.i18n);
});

const defaults = { usageLimit: 60, breakTime: 5 };

function mergeSettingsWithDefaults(settings) {
  return { ...defaults, ...settings };
}

function getClampedNumberValue(inputId, fallback) {
  const input = document.getElementById(inputId);
  const val = Number.parseInt(input.value, 10);
  const min = Number.parseInt(input.min, 10);
  const max = Number.parseInt(input.max, 10);
  return Number.isNaN(val) ? fallback : Math.min(Math.max(val, min), max);
}

const dismissBtn = document.getElementById('dismissBtn');
const timerDisplay = document.getElementById('timerDisplay');
const progressFill = document.getElementById('progressFill');

let totalLimitSeconds = defaults.usageLimit * 60;

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function updateStatus() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) return;
    chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_CAT_STATUS' }, (res) => {
      void chrome.runtime.lastError;
      if (!res) {
        timerDisplay.textContent = '--:--';
        progressFill.style.width = '0%';
        return;
      }
      if (res.catIsActive) {
        dismissBtn.style.display = 'block';
        timerDisplay.classList.add('cat-active');
        timerDisplay.textContent = '🐱 Cat is here!';
        progressFill.style.width = '100%';
      } else {
        dismissBtn.style.display = 'none';
        timerDisplay.classList.remove('cat-active');
        const remaining = Math.max(0, res.usageLimit * 60 - res.currentSeconds);
        timerDisplay.textContent = formatTime(remaining);
        const elapsed = res.usageLimit * 60 - remaining;
        const pct = Math.min(100, (elapsed / (res.usageLimit * 60)) * 100);
        progressFill.style.width = `${pct}%`;
      }
    });
  });
}

updateStatus();
const pollInterval = setInterval(updateStatus, 1000);
window.addEventListener('unload', () => clearInterval(pollInterval));

dismissBtn.addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { type: 'DISMISS_CAT' }, () => {
      void chrome.runtime.lastError;
    });
    dismissBtn.style.display = 'none';
  });
});

chrome.storage.local.get(defaults, (settings) => {
  const merged = mergeSettingsWithDefaults(settings);
  document.getElementById('usageLimit').value = merged.usageLimit;
  document.getElementById('breakTime').value = merged.breakTime;
  totalLimitSeconds = merged.usageLimit * 60;
  chrome.storage.local.set(merged);
});

// Stepper buttons
document.querySelectorAll('.stepper-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const input = document.getElementById(btn.dataset.target);
    const delta = Number(btn.dataset.delta);
    const min = Number.parseInt(input.min, 10);
    const max = Number.parseInt(input.max, 10);
    const current = Number.parseInt(input.value, 10) || min;
    input.value = Math.min(max, Math.max(min, current + delta));
  });
});

document.getElementById('saveBtn').addEventListener('click', () => {
  const settings = {
    usageLimit: getClampedNumberValue('usageLimit', defaults.usageLimit),
    breakTime: getClampedNumberValue('breakTime', defaults.breakTime),
  };

  document.getElementById('usageLimit').value = settings.usageLimit;
  document.getElementById('breakTime').value = settings.breakTime;
  totalLimitSeconds = settings.usageLimit * 60;

  chrome.storage.local.set(settings, () => {
    const msg = document.getElementById('savedMsg');
    msg.style.display = 'block';
    setTimeout(() => (msg.style.display = 'none'), 2000);

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, { type: 'UPDATE_SETTINGS', settings }, () => {
        void chrome.runtime.lastError;
      });
    });
  });
});
