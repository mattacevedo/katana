// background/service-worker.js
// Central coordinator: message routing, Katana API calls, auth token management.
//
// KEY DIFFERENCE from prototype: instead of calling Claude directly,
// we POST to https://katana-woad.vercel.app/api/grade — the backend handles
// auth validation, quota enforcement, and the Claude API call.

const KATANA_API_BASE = 'https://katana-woad.vercel.app';

// ─── Keep the service worker alive while the side panel is open ─────────────
chrome.runtime.onConnect.addListener(port => {
  if (port.name === 'katana-sidebar') {
    port.onDisconnect.addListener(() => {});
  }
});

// ─── Open side panel when the toolbar icon is clicked ───────────────────────
chrome.action.onClicked.addListener(tab => {
  chrome.sidePanel.open({ tabId: tab.id });
});

// ─── External messages from the Katana web app ──────────────────────────────
// Called by the auth/callback page after the magic link is clicked.
// chrome.runtime.sendMessage(extensionId, ...) from a web page fires onMessageExternal,
// NOT onMessage — so we need a separate listener here.
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (message.type !== 'AUTH_TOKEN_RECEIVED') return;

  // Verify the message came from our web app
  const allowedOrigins = ['https://katana-woad.vercel.app'];
  if (!allowedOrigins.includes(sender.origin)) {
    sendResponse({ ok: false, error: 'Unauthorized origin.' });
    return;
  }

  chrome.storage.local.set({
    authToken: message.token,
    userEmail: message.email,
    plan: message.plan
  }, () => {
    sendResponse({ ok: true });
  });

  return true; // keep channel open for async sendResponse
});

// ─── Main message router ────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'GRADE_SUBMISSION':
      handleGradeSubmission(message, sendResponse);
      return true; // keep channel open for async response

    case 'SETTINGS_SAVE':
      chrome.storage.sync.set(message.payload, () => {
        sendResponse({ ok: true });
      });
      return true;

    case 'STUDENT_CHANGED':
      chrome.runtime.sendMessage({ type: 'STUDENT_CHANGED' }).catch(() => {});
      break;

    case 'GET_SETTINGS':
      chrome.storage.sync.get(
        ['model', 'tone', 'customInstructions', 'feedbackLength', 'strictness',
         'greetByFirstName', 'lateDeduction', 'lateDeductionPerDay'],
        data => sendResponse({ ok: true, settings: data })
      );
      return true;

    case 'GET_AUTH':
      chrome.storage.local.get(['authToken', 'userEmail', 'plan'], data => {
        sendResponse({ ok: true, auth: data });
      });
      return true;

    case 'SIGN_OUT':
      chrome.storage.local.remove(['authToken', 'userEmail', 'plan'], () => {
        sendResponse({ ok: true });
      });
      return true;
  }
});

// ─── Grade Submission Handler ────────────────────────────────────────────────
async function handleGradeSubmission(message, sendResponse) {
  try {
    // 1. Get the active SpeedGrader tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('No active tab found.');

    // 2. Check auth token
    const { authToken } = await chrome.storage.local.get('authToken');
    if (!authToken) {
      throw new Error('Not signed in. Open Katana and sign in to your account.');
    }

    // 3. Collect submission data from content script
    const collectionResult = await sendToContentScript(tab.id, { type: 'COLLECT_DATA' });
    if (!collectionResult?.ok) {
      throw new Error(collectionResult?.error || 'Failed to collect submission data.');
    }
    const submissionData = collectionResult.data;

    // 4. Load settings
    const settings = await new Promise(resolve =>
      chrome.storage.sync.get([
        'model', 'tone', 'customInstructions', 'feedbackLength', 'strictness',
        'greetByFirstName', 'lateDeduction', 'lateDeductionPerDay'
      ], resolve)
    );

    // 5. POST to Katana backend — it calls Claude and returns the result
    const katanaResult = await callKatanaAPI(authToken, submissionData, settings);

    // 6. Programmatically enforce grade cap
    const { gradingType, maxPoints } = submissionData.gradingSchema || {};
    if (gradingType === 'points' || gradingType === 'percent') {
      const rawMax = parseFloat(maxPoints);
      const cap = gradingType === 'percent' ? 100 : (isNaN(rawMax) ? null : rawMax);
      if (cap !== null) {
        const numericGrade = parseFloat(katanaResult.grade);
        if (!isNaN(numericGrade) && numericGrade > cap) {
          katanaResult.grade = String(cap);
        }
      }
    }

    // 7. Apply grade to Canvas via content script
    const applyResult = await sendToContentScript(tab.id, {
      type: 'APPLY_GRADE',
      grade: katanaResult.grade,
      feedback: katanaResult.feedback,
      rubricRatings: katanaResult.rubric_ratings || []
    });

    const applyWarning = applyResult?.ok
      ? null
      : (applyResult?.error || 'Grade could not be applied to Canvas automatically. Review and enter manually.');

    sendResponse({
      ok: true,
      result: {
        grade: katanaResult.grade,
        feedback: katanaResult.feedback,
        grading_rationale: katanaResult.grading_rationale,
        confidence: katanaResult.confidence || 'high',
        confidence_reason: katanaResult.confidence_reason || null,
        applyWarning,
        studentName: submissionData.studentName,
        assignmentTitle: submissionData.assignmentTitle
      }
    });

  } catch (err) {
    console.error('Katana: grade submission error:', err);
    // Surface quota / auth errors distinctly
    sendResponse({ ok: false, error: err.message, code: err.code || null });
  }
}

// ─── Katana Backend API Call ─────────────────────────────────────────────────
async function callKatanaAPI(authToken, submissionData, settings) {
  const response = await fetch(`${KATANA_API_BASE}/api/grade`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ submissionData, settings })
  });

  if (response.status === 401) {
    const err = new Error('Session expired. Please sign in again.');
    err.code = 'AUTH_EXPIRED';
    throw err;
  }

  if (response.status === 402) {
    const err = new Error('You\'ve used all your grading credits for this period. Upgrade your plan to continue.');
    err.code = 'QUOTA_EXCEEDED';
    throw err;
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    let msg = `Katana API error (${response.status})`;
    try { msg = JSON.parse(body)?.error || msg; } catch {}
    throw new Error(msg);
  }

  const data = await response.json();
  if (!data.grade || !data.feedback) {
    throw new Error('Unexpected response from Katana. Please try again.');
  }
  return data;
}

// ─── Content Script Messaging ────────────────────────────────────────────────
function sendToContentScript(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, response => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}
