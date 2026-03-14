// sidepanel/sidepanel.js
// KEY DIFFERENCE from prototype: auth token instead of API key.
// Sign-in opens gradewithkatana.com; the web app passes the token back via
// chrome.runtime.sendMessage from the extension-callback page.

'use strict';

const APP_BASE = 'https://www.gradewithkatana.com';

// ─── Keep the service worker alive ────────────────────────────────────────
let keepAlivePort = null;

function connectKeepAlive() {
  keepAlivePort = chrome.runtime.connect({ name: 'katana-sidebar' });
  keepAlivePort.onDisconnect.addListener(() => {
    setTimeout(connectKeepAlive, 500);
  });
}
connectKeepAlive();

// ─── State ────────────────────────────────────────────────────────────────
let currentTabId = null;
let fullFeedbackText = '';
let feedbackExpanded = false;
let isSignedIn = false;

// ─── Tab navigation ───────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => {
      b.classList.remove('active');
      b.setAttribute('aria-selected', 'false');
    });
    document.querySelectorAll('.tab-content').forEach(s => s.classList.add('hidden'));
    btn.classList.add('active');
    btn.setAttribute('aria-selected', 'true');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.remove('hidden');
  });
});

// ─── State machine ─────────────────────────────────────────────────────────
const STATES = ['signed-out', 'idle', 'wrong-page', 'loading', 'results', 'error'];

function setState(name) {
  STATES.forEach(s => {
    const el = document.getElementById(`state-${s}`);
    if (el) el.classList.toggle('hidden', s !== name);
  });
}

// ─── Auth state ────────────────────────────────────────────────────────────
async function loadAuthState() {
  const auth = await chrome.storage.local.get(['authToken', 'userEmail', 'plan']);
  isSignedIn = !!(auth.authToken);

  // Update settings account card
  const cardIn  = document.getElementById('account-card-signed-in');
  const cardOut = document.getElementById('account-card-signed-out');

  if (isSignedIn) {
    cardIn.classList.remove('hidden');
    cardOut.classList.add('hidden');
    document.getElementById('account-email').textContent = auth.userEmail || 'Signed in';
    const planDisplay = auth.plan ? auth.plan.charAt(0).toUpperCase() + auth.plan.slice(1) : '';
    document.getElementById('account-plan').textContent  = planDisplay ? `Plan: ${planDisplay}` : '';
    // Fetch live quota (non-blocking)
    fetchAndDisplayQuota(auth.authToken);
  } else {
    cardIn.classList.add('hidden');
    cardOut.classList.remove('hidden');
  }

  return isSignedIn;
}

async function fetchAndDisplayQuota(authToken) {
  const quotaEl = document.getElementById('account-quota');
  if (!quotaEl) return;
  try {
    const resp = await fetch(`${APP_BASE}/api/quota`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if (!resp.ok) return;
    const data = await resp.json();
    const { remaining, limit } = data;
    if (typeof remaining === 'number' && typeof limit === 'number') {
      quotaEl.textContent = `${remaining} of ${limit} grades remaining this period`;
    }
  } catch (_) {}
}

// Watch for auth changes (e.g. sign-in from another tab)
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.authToken) return;
  loadAuthState().then(() => checkCurrentPage());
});

// ─── Page detection ────────────────────────────────────────────────────────
async function checkCurrentPage() {
  try {
    const signedIn = await loadAuthState();
    if (!signedIn) { setState('signed-out'); return; }

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTabId = tab?.id ?? null;
    const isSpeedGrader = /instructure\.com\/courses\/\d+\/gradebook\/speed_grader/.test(tab?.url ?? '');

    if (!isSpeedGrader) { setState('wrong-page'); return; }

    try {
      let info = await sendToContentScript({ type: 'GET_PAGE_INFO' }).catch(() => null);
      if (!info?.ok) {
        // Content script not yet injected into this already-loaded tab — inject it now
        try {
          await chrome.scripting.executeScript({ target: { tabId: currentTabId }, files: ['content/content.js'] });
          await chrome.scripting.insertCSS({ target: { tabId: currentTabId }, files: ['content/content.css'] }).catch(() => {});
          await new Promise(r => setTimeout(r, 300));
          info = await sendToContentScript({ type: 'GET_PAGE_INFO' }).catch(() => null);
        } catch (_inject) {}
      }
      if (info?.ok) document.getElementById('student-name').textContent = info.studentName || 'Loading…';
    } catch (_) {}

    setState('idle');
  } catch (err) {
    console.warn('Katana: page check failed', err.message);
    setState('wrong-page');
  }
}

// ─── Sign in / out ─────────────────────────────────────────────────────────
function openSignIn() {
  chrome.tabs.create({ url: `${APP_BASE}/auth/signin?source=extension` });
}

document.getElementById('btn-signin').addEventListener('click', openSignIn);
document.getElementById('btn-signin-settings').addEventListener('click', openSignIn);
document.getElementById('btn-error-signin').addEventListener('click', openSignIn);

document.getElementById('btn-signout').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'SIGN_OUT' });
  isSignedIn = false;
  loadAuthState();
  setState('signed-out');
});

// ─── Grade button ──────────────────────────────────────────────────────────
document.getElementById('btn-grade').addEventListener('click', triggerGrading);
document.getElementById('btn-regrade').addEventListener('click', triggerGrading);
document.getElementById('btn-retry').addEventListener('click', triggerGrading);

async function triggerGrading() {
  setState('loading');
  feedbackExpanded = false;

  try {
    const response = await chrome.runtime.sendMessage({ type: 'GRADE_SUBMISSION' });

    if (!response?.ok) {
      // Auth errors: show sign-in button
      if (response?.code === 'AUTH_EXPIRED') {
        document.getElementById('btn-error-signin').classList.remove('hidden');
      } else {
        document.getElementById('btn-error-signin').classList.add('hidden');
      }
      throw new Error(response?.error || 'Grading failed — unknown error.');
    }

    document.getElementById('btn-error-signin').classList.add('hidden');
    displayResults(response.result);
    // Refresh quota count now that one grade has been consumed
    chrome.storage.local.get('authToken', ({ authToken }) => {
      if (authToken) fetchAndDisplayQuota(authToken);
    });

  } catch (err) {
    document.getElementById('error-message').textContent = err.message;
    setState('error');
  }
}

function displayResults(result) {
  document.getElementById('result-grade').textContent = result.grade ?? '—';
  document.getElementById('result-student-name').textContent = result.studentName || '';

  fullFeedbackText = result.feedback || '';
  const PREVIEW_LENGTH = 280;
  const feedbackEl = document.getElementById('result-feedback');
  const expandBtn = document.getElementById('btn-expand-feedback');

  if (fullFeedbackText.length <= PREVIEW_LENGTH) {
    feedbackEl.textContent = fullFeedbackText;
    expandBtn.classList.add('hidden');
  } else {
    feedbackEl.textContent = fullFeedbackText.substring(0, PREVIEW_LENGTH) + '…';
    expandBtn.classList.remove('hidden');
    expandBtn.textContent = 'Show full feedback';
    feedbackExpanded = false;
  }

  document.getElementById('result-rationale').textContent = result.grading_rationale || '';

  const applyWarning = document.getElementById('apply-warning');
  const applyWarningText = document.getElementById('apply-warning-text');
  if (result.applyWarning) {
    applyWarningText.textContent = result.applyWarning;
    applyWarning.classList.remove('hidden');
  } else {
    applyWarning.classList.add('hidden');
  }

  const confidence = result.confidence || 'high';
  const CONFIDENCE_LABELS = { high: 'High Confidence', medium: 'Medium Confidence', low: 'Low Confidence' };
  const badge = document.getElementById('result-confidence-badge');
  badge.textContent = CONFIDENCE_LABELS[confidence] || 'High Confidence';
  badge.className = `confidence-badge confidence-${confidence}`;

  const warning = document.getElementById('confidence-warning');
  const warningText = document.getElementById('confidence-warning-text');
  if ((confidence === 'low' || confidence === 'medium') && result.confidence_reason) {
    warningText.textContent = result.confidence_reason;
    warning.classList.remove('hidden');
  } else {
    warning.classList.add('hidden');
  }

  const annotationRow = document.getElementById('result-annotations-row');
  const annotationText = document.getElementById('result-annotations-text');
  if (result.inlineAnnotationsPosted > 0) {
    if (annotationRow && annotationText) {
      annotationText.textContent = `${result.inlineAnnotationsPosted} inline annotation${result.inlineAnnotationsPosted === 1 ? '' : 's'} added to document`;
      annotationRow.classList.remove('hidden');
    }
  } else if (annotationRow) {
    annotationRow.classList.add('hidden');
  }

  setState('results');
}

document.getElementById('btn-expand-feedback').addEventListener('click', () => {
  const feedbackEl = document.getElementById('result-feedback');
  const expandBtn = document.getElementById('btn-expand-feedback');
  feedbackExpanded = !feedbackExpanded;
  feedbackEl.textContent = feedbackExpanded ? fullFeedbackText : fullFeedbackText.substring(0, 280) + '…';
  expandBtn.textContent = feedbackExpanded ? 'Show less' : 'Show full feedback';
});

// ─── Settings ──────────────────────────────────────────────────────────────
const FEEDBACK_LENGTH_LABELS = ['', 'Short', 'Brief', 'Standard', 'Detailed', 'Comprehensive'];
const STRICTNESS_LABELS      = ['', 'Lenient', 'Generous', 'Balanced', 'Firm', 'Strict'];

function updateSliderLabel(value) {
  document.getElementById('feedback-length-label').textContent = FEEDBACK_LENGTH_LABELS[value] || 'Standard';
}

function updateStrictnessLabel(value) {
  document.getElementById('strictness-label').textContent = STRICTNESS_LABELS[value] || 'Balanced';
}

document.getElementById('feedback-length').addEventListener('input', e => updateSliderLabel(e.target.value));
document.getElementById('strictness').addEventListener('input', e => updateStrictnessLabel(e.target.value));

document.getElementById('late-deduction').addEventListener('change', e => {
  document.getElementById('late-deduction-controls').classList.toggle('hidden', !e.target.checked);
});

document.getElementById('inline-comments').addEventListener('change', e => {
  document.getElementById('annotations-density-controls').classList.toggle('hidden', !e.target.checked);
});

async function loadSettings() {
  const settings = await chrome.storage.sync.get([
    'tone', 'customInstructions', 'feedbackLength', 'strictness',
    'greetByFirstName', 'lateDeduction', 'lateDeductionPerDay', 'inlineComments',
    'annotationsPerPage'
  ]);

  if (settings.tone)  document.getElementById('tone-select').value = settings.tone;
  if (settings.customInstructions) document.getElementById('custom-instructions').value = settings.customInstructions;

  const length = settings.feedbackLength || 3;
  document.getElementById('feedback-length').value = length;
  updateSliderLabel(length);

  const strictness = settings.strictness || 3;
  document.getElementById('strictness').value = strictness;
  updateStrictnessLabel(strictness);

  document.getElementById('greet-first-name').checked = !!settings.greetByFirstName;
  const lateDeduction = !!settings.lateDeduction;
  document.getElementById('late-deduction').checked = lateDeduction;
  document.getElementById('late-deduction-controls').classList.toggle('hidden', !lateDeduction);
  document.getElementById('late-deduction-per-day').value = settings.lateDeductionPerDay || 10;
  const inlineComments = !!settings.inlineComments;
  document.getElementById('inline-comments').checked = inlineComments;
  document.getElementById('annotations-density-controls').classList.toggle('hidden', !inlineComments);
  document.getElementById('annotations-per-page').value = settings.annotationsPerPage ?? 1;
}

document.getElementById('btn-save-settings').addEventListener('click', async () => {
  const payload = {
    tone: document.getElementById('tone-select').value,
    customInstructions: document.getElementById('custom-instructions').value.trim(),
    feedbackLength: parseInt(document.getElementById('feedback-length').value, 10),
    strictness: parseInt(document.getElementById('strictness').value, 10),
    greetByFirstName: document.getElementById('greet-first-name').checked,
    lateDeduction: document.getElementById('late-deduction').checked,
    lateDeductionPerDay: parseInt(document.getElementById('late-deduction-per-day').value, 10) || 10,
    inlineComments: document.getElementById('inline-comments').checked,
    annotationsPerPage: parseFloat(document.getElementById('annotations-per-page').value) || 1
  };

  const btn = document.getElementById('btn-save-settings');
  btn.disabled = true;
  btn.textContent = 'Saving…';

  try {
    await chrome.runtime.sendMessage({ type: 'SETTINGS_SAVE', payload });
    showSettingsStatus('Settings saved.', false);
  } catch (e) {
    showSettingsStatus('Save failed: ' + e.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save Settings';
  }
});

function showSettingsStatus(msg, isError) {
  const el = document.getElementById('settings-status');
  el.textContent = msg;
  el.classList.remove('hidden', 'error');
  if (isError) el.classList.add('error');
  setTimeout(() => el.classList.add('hidden'), 3000);
}

// ─── Incoming messages from background ────────────────────────────────────
chrome.runtime.onMessage.addListener(message => {
  if (message.type === 'STUDENT_CHANGED') {
    const gradeTab = document.getElementById('tab-grade');
    if (!gradeTab.classList.contains('hidden')) checkCurrentPage();
  }
  // Auth token received from web app callback
  if (message.type === 'AUTH_TOKEN_RECEIVED') {
    chrome.storage.local.set({
      authToken: message.token,
      userEmail: message.email,
      plan: message.plan
    }, () => {
      loadAuthState();
      checkCurrentPage();
    });
  }
});

// ─── Tab/navigation changes ───────────────────────────────────────────────
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'complete') checkCurrentPage();
});

chrome.tabs.onActivated.addListener(() => {
  checkCurrentPage();
});

// ─── Helpers ──────────────────────────────────────────────────────────────
function sendToContentScript(message) {
  return new Promise((resolve, reject) => {
    if (!currentTabId) return reject(new Error('No active tab'));
    chrome.tabs.sendMessage(currentTabId, message, response => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(response);
    });
  });
}

// ─── Init ─────────────────────────────────────────────────────────────────
loadSettings();
checkCurrentPage();
