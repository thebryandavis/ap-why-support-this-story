const keyInput    = document.getElementById('api-key');
const saveBtn     = document.getElementById('save-btn');
const statusEl    = document.getElementById('status');
const injectBtn   = document.getElementById('inject-btn');
const injectLabel = document.getElementById('inject-label');
const pageStatus  = document.getElementById('page-status');

// ── Load saved key ─────────────────────────────────────────────
chrome.storage.local.get('openai_key', ({ openai_key }) => {
  if (openai_key) {
    keyInput.value = openai_key;
    showStatus('ok', 'Key saved ✓');
  }
});

// ── Save key ──────────────────────────────────────────────────
saveBtn.addEventListener('click', () => {
  const key = keyInput.value.trim();
  if (!key.startsWith('sk-')) {
    showStatus('err', 'Key should start with sk-');
    return;
  }
  chrome.storage.local.set({ openai_key: key }, () => {
    showStatus('ok', 'Saved ✓');
  });
});

// ── Check current tab ─────────────────────────────────────────
chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  const url = tab?.url || '';
  const isStory = /apnews\.com\/article\//.test(url);

  if (isStory) {
    pageStatus.textContent = 'AP story detected ✓';
    pageStatus.className = 'page-status on-story';
    injectBtn.disabled = false;
  } else if (/apnews\.com/.test(url)) {
    pageStatus.textContent = 'Navigate to a story page to use this tool.';
    pageStatus.className = 'page-status';
  } else {
    pageStatus.textContent = 'Not on APNews.com';
    pageStatus.className = 'page-status';
  }
});

// ── Inject / generate ─────────────────────────────────────────
injectBtn.addEventListener('click', async () => {
  const key = keyInput.value.trim();
  if (!key) {
    showStatus('err', 'Enter your API key first.');
    return;
  }

  chrome.storage.local.set({ openai_key: key });

  injectBtn.disabled = true;
  injectLabel.textContent = 'Generating…';

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // Send message to content script
  chrome.tabs.sendMessage(tab.id, { type: 'GENERATE', key }, (response) => {
    injectBtn.disabled = false;
    injectLabel.textContent = 'Generate Support Box';

    if (chrome.runtime.lastError) {
      showStatus('err', 'Could not reach page. Try refreshing.');
      return;
    }
    if (response?.error) {
      showStatus('err', response.error);
      return;
    }
    showStatus('ok', 'Support box injected ✓');
    // Close popup so user can see the result
    setTimeout(() => window.close(), 600);
  });
});

// ── Helpers ───────────────────────────────────────────────────
function showStatus(type, msg) {
  statusEl.textContent = msg;
  statusEl.className = `status ${type}`;
}
