// background/service-worker.js
// Central coordinator: message routing, Katana API calls, auth token management.
//
// KEY DIFFERENCE from prototype: instead of calling Claude directly,
// we POST to https://www.gradewithkatana.com/api/grade — the backend handles
// auth validation, quota enforcement, and the Claude API call.

const KATANA_API_BASE = 'https://www.gradewithkatana.com';

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
  console.log('Katana: onMessageExternal received:', message.type, 'from:', sender.origin);

  // Verify the message came from our web app
  const allowedOrigins = ['https://www.gradewithkatana.com'];
  if (!allowedOrigins.includes(sender.origin)) {
    console.warn('Katana: Rejected auth message from unauthorized origin:', sender.origin);
    sendResponse({ ok: false, error: 'Unauthorized origin.' });
    return;
  }

  if (message.type === 'AUTH_TOKEN_RECEIVED') {
    console.log('Katana: Storing auth token for', message.email, '| plan:', message.plan);
    chrome.storage.local.set({
      authToken: message.token,
      userEmail: message.email,
      plan: message.plan
    }, () => {
      console.log('Katana: Auth token stored successfully');
      sendResponse({ ok: true });
    });
    return true; // keep channel open for async sendResponse
  }

  if (message.type === 'SIGN_OUT') {
    console.log('Katana: Clearing auth token (sign-out from web app)');
    chrome.storage.local.remove(['authToken', 'userEmail', 'plan'], () => {
      sendResponse({ ok: true });
    });
    return true;
  }
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
        ['tone', 'customInstructions', 'feedbackLength', 'strictness',
         'greetByFirstName', 'lateDeduction', 'lateDeductionPerDay', 'inlineComments',
         'annotationsPerPage'],
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
        'tone', 'customInstructions', 'feedbackLength', 'strictness',
        'greetByFirstName', 'lateDeduction', 'lateDeductionPerDay', 'inlineComments',
        'annotationsPerPage'
      ], resolve)
    );

    // 5. Strip docViewerUrl before sending to backend; fetch page count if annotating
    const { docViewerUrl, ...submissionForApi } = submissionData;
    console.log('Katana: settings.inlineComments =', settings.inlineComments, '| docViewerUrl:', docViewerUrl ? 'present' : 'absent');
    if (settings.inlineComments) {
      // If content script detected a DocViewer iframe, flag it for the backend
      // so annotations are generated even if pageCount/fileAttachments fail
      if (docViewerUrl) {
        submissionForApi.hasDocViewer = true;
      }
      const pageCount = await getPageCountFromCanvadocs(tab.id).catch((e) => {
        console.warn('Katana: getPageCountFromCanvadocs error:', e?.message);
        return null;
      });
      console.log('Katana: canvadocs pageCount =', pageCount);
      if (pageCount) {
        submissionForApi.pageCount = pageCount;
        submissionForApi.hasDocViewer = true;
      }
    }

    // 6. POST to Katana backend — it calls Claude and returns the result
    const katanaResult = await callKatanaAPI(authToken, submissionForApi, settings);
    console.log('Katana: backend returned inline_comments:', katanaResult.inline_comments?.length ?? 0);

    // 7. Post inline annotations to Canvadocs (best-effort, non-blocking on grading)
    let inlineAnnotationsPosted = 0;
    if (settings.inlineComments && katanaResult.inline_comments?.length) {
      try {
        const jwtInfo = await resolveCanvadocJWT(tab.id);
        console.log('Katana: resolved JWT info:', jwtInfo ? `jwt=${jwtInfo.jwt.substring(0, 20)}… base=${jwtInfo.baseUrl}` : 'null');
        if (jwtInfo) {
          const { posted } = await postCanvadocsAnnotations(jwtInfo, katanaResult.inline_comments, tab.id);
          inlineAnnotationsPosted = posted;
        } else {
          console.warn('Katana: skipping annotations — no canvadocs JWT found in tab frames');
        }
      } catch (e) {
        console.warn('Katana: inline annotation posting failed', e.message);
      }
    } else if (settings.inlineComments) {
      console.log('Katana: backend returned 0 inline_comments — check if hasDocViewer was true on backend');
    } else {
      console.log('Katana: inline comments disabled in settings — skipping annotations');
    }

    // 9. Programmatically enforce grade cap
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

    // 10. Apply grade to Canvas via content script
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
        assignmentTitle: submissionData.assignmentTitle,
        inlineAnnotationsPosted
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

// ─── Canvadocs Inline Annotations ────────────────────────────────────────────

// Extracts the Canvadocs JWT + base URL directly from the already-loaded
// canvadocs.instructure.com iframe URL in the tab.
// The JWT is visible in the iframe's URL path:
// https://canvadocs.instructure.com/1/sessions/{JWT}/view?theme=dark
// This avoids having to fetch the Canvas canvadoc_session endpoint entirely.
async function resolveCanvadocJWT(tabId) {
  try {
    const frames = await chrome.webNavigation.getAllFrames({ tabId });
    const frame = frames?.find(f => f.url?.includes('canvadocs.instructure.com'));
    if (!frame?.url) return null;
    const url = new URL(frame.url);
    const match = url.pathname.match(/\/sessions\/([^/]+)\//);
    if (!match) return null;
    return { jwt: match[1], baseUrl: url.origin };
  } catch (e) {
    console.warn('Katana: could not resolve Canvadoc JWT from frame', e.message);
    return null;
  }
}

// Decodes the Canvadocs JWT (without verification) to extract document_id,
// user_id, and user_name needed in the annotation body.
function decodeCanvadocJWT(jwt) {
  try {
    const payload = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = payload + '=='.slice(payload.length % 4 || 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

// PUTs highlight annotations (with point fallback) to Canvadocs on behalf of the instructor.
// Queries the canvadocs content script for exact text positions; falls back to
// a staggered point annotation if the quoted text can't be located in the rendered page.
async function postCanvadocsAnnotations(jwtInfo, inlineComments, tabId) {
  const { jwt, baseUrl } = jwtInfo;
  const payload = decodeCanvadocJWT(jwt);

  // Try multiple field-name conventions used by different Canvas/Canvadocs versions.
  // If decode completely failed, proceed with undefined fields — Canvadocs may still accept.
  const docId    = payload?.d    ?? payload?.document_id ?? undefined;
  const userId   = payload?.a?.u ?? payload?.sub         ?? payload?.user_id   ?? undefined;
  const userName = payload?.a?.n ?? payload?.user_name   ?? payload?.name      ?? undefined;

  console.log('Katana: Canvadocs JWT payload', JSON.stringify(payload));
  console.log('Katana: posting', inlineComments.length, 'annotations to', baseUrl, '— docId:', docId, 'userId:', userId);

  // Ask the canvadocs content script for text positions
  let textPositions = null;
  if (tabId) {
    const quotes = inlineComments.map(c => ({ quote: c.quote, page: c.page }));
    textPositions = await getTextPositionsFromCanvadocs(tabId, quotes).catch(() => null);
  }

  // Pre-compute per-page fallback stagger indices for point annotations
  const pageCount = {};
  const pageIdx   = inlineComments.map((c, i) => {
    const page = textPositions?.[i]?.found ? textPositions[i].page : (c.page || 1);
    const idx = pageCount[page] || 0;
    pageCount[page] = idx + 1;
    return idx;
  });

  let posted = 0, failed = 0;

  for (let i = 0; i < inlineComments.length; i++) {
    const c   = inlineComments[i];
    const pos = textPositions?.[i];
    const id  = crypto.randomUUID();
    const contents = c.quote ? `"${c.quote}"\n\n${c.comment}` : c.comment;

    let body;

    if (pos?.found && pos.coords?.length === 8) {
      // Highlight annotation — tied to actual text
      body = {
        id,
        document_id: docId,
        user_id:     userId,
        user_name:   userName,
        type:        'highlight',
        page:        pos.page - 1, // 0-indexed
        contents,
        color:       '#f7c948',    // amber highlight
        coords:      pos.coords
      };
    } else {
      // Point annotation fallback — staggered vertically on the page
      body = {
        id,
        document_id: docId,
        user_id:     userId,
        user_name:   userName,
        type:        'point',
        page:        Math.max(0, (c.page || 1) - 1), // 0-indexed
        contents,
        color:       '#f7c948',
        rect:        { top: 60 + pageIdx[i] * 110, left: 30, width: 14, height: 18 }
      };
    }

    try {
      const resp = await fetch(
        `${baseUrl}/2018-03-07/sessions/${jwt}/annotations/${id}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          credentials: 'include'
        }
      );
      if (resp.ok) {
        posted++;
        console.log(`Katana: annotation ${i + 1} posted OK`);
      } else {
        const errBody = await resp.text().catch(() => '');
        console.warn(`Katana: annotation PUT failed (${resp.status})`, errBody.substring(0, 200));
        failed++;
      }
    } catch (e) {
      console.warn('Katana: annotation PUT error', e.message);
      failed++;
    }
  }

  return { posted, failed };
}

// ─── Canvadocs Frame Helpers ──────────────────────────────────────────────────

// Finds the frameId of the canvadocs.instructure.com iframe in the given tab.
async function getCanvadocsFrameId(tabId) {
  try {
    const frames = await chrome.webNavigation.getAllFrames({ tabId });
    const urls = frames?.map(f => f.url?.substring(0, 120)) || [];
    console.log('Katana: getAllFrames:', frames?.length, 'frames —', JSON.stringify(urls));
    const frame  = frames?.find(f => f.url?.includes('canvadocs.instructure.com'));
    if (frame) {
      console.log('Katana: found canvadocs frame — frameId:', frame.frameId, 'url:', frame.url?.substring(0, 100));
    } else {
      console.warn('Katana: no canvadocs.instructure.com frame found among', frames?.length, 'frames');
    }
    return frame?.frameId ?? null;
  } catch (e) {
    console.warn('Katana: could not get canvadocs frame ID', e.message);
    return null;
  }
}

// Queries the canvadocs content script for the rendered page count.
async function getPageCountFromCanvadocs(tabId) {
  const frameId = await getCanvadocsFrameId(tabId);
  if (frameId === null) return null;
  return new Promise(resolve => {
    chrome.tabs.sendMessage(tabId, { type: 'CANVADOCS_GET_PAGE_COUNT' }, { frameId }, response => {
      if (chrome.runtime.lastError) { resolve(null); }
      else { resolve(response?.count ?? null); }
    });
  });
}

// Queries the canvadocs content script for text positions of the given quotes.
// quotes: [{quote: string, page: number}]
// Returns: [{found: bool, page: number, coords: number[8]} | {found: false}]
async function getTextPositionsFromCanvadocs(tabId, quotes) {
  const frameId = await getCanvadocsFrameId(tabId);
  if (frameId === null) return null;
  return new Promise(resolve => {
    chrome.tabs.sendMessage(
      tabId,
      { type: 'CANVADOCS_FIND_TEXT_POSITIONS', quotes },
      { frameId },
      response => {
        if (chrome.runtime.lastError) { resolve(null); }
        else { resolve(response?.results ?? null); }
      }
    );
  });
}
