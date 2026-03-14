// content/content.js
// Injected into Canvas SpeedGrader pages.
// Responsibilities: DOM scraping, grade/feedback auto-fill, injected button, student navigation observer.
//
// KEY DIFFERENCE from prototype: auth token gate (not API key gate).
// The button is enabled only when a valid Katana auth token exists in storage.

(function () {
  'use strict';

  // ─── Guard: only run once ──────────────────────────────────────────────
  if (window.__katanaLoaded) return;
  window.__katanaLoaded = true;

  // ─── Message listener ──────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    switch (message.type) {
      case 'COLLECT_DATA':
        collectSubmissionData()
          .then(data => sendResponse({ ok: true, data }))
          .catch(err => sendResponse({ ok: false, error: err.message }));
        return true;

      case 'APPLY_GRADE':
        applyGrade(message)
          .then(() => sendResponse({ ok: true }))
          .catch(err => sendResponse({ ok: false, error: err.message }));
        return true;

      case 'GET_PAGE_INFO':
        sendResponse({ ok: true, isSpeedGrader: true, studentName: getStudentName() });
        break;
    }
  });

  // ─── Auth gate: disable button if not signed in ───────────────────────
  function updateButtonAuthState(btn) {
    chrome.storage.local.get('authToken', ({ authToken }) => {
      const signedIn = authToken && authToken.length > 0;
      btn.disabled = !signedIn;
      btn.title = signedIn ? 'Grade with Katana AI' : 'Sign in to Katana to grade submissions';
    });
  }

  // Watch for sign-in/sign-out while the page is open
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.authToken) return;
    const btn = document.getElementById('katana-grade-btn');
    if (btn) updateButtonAuthState(btn);
  });

  // ─── Inject the "Grade with Katana" toolbar button ─────────────────────
  function injectKatanaButton() {
    if (document.getElementById('katana-grade-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'katana-grade-btn';
    btn.className = 'katana-toolbar-btn';
    btn.title = 'Grade with Katana AI';
    btn.innerHTML = '⚡ Grade with Katana';

    // Disable immediately; enable once we confirm a valid auth token
    btn.disabled = true;
    updateButtonAuthState(btn);

    btn.addEventListener('click', () => {
      btn.disabled = true;
      btn.textContent = '⏳ Grading…';

      const safetyTimer = setTimeout(() => {
        btn.disabled = false;
        btn.innerHTML = '⚡ Grade with Katana';
        console.warn('Katana: grading timed out — no response from service worker');
      }, 90000);

      chrome.runtime.sendMessage({ type: 'GRADE_SUBMISSION' }, response => {
        clearTimeout(safetyTimer);
        btn.disabled = false;
        btn.innerHTML = '⚡ Grade with Katana';
        if (!response?.ok) {
          console.error('Katana error:', response?.error);
        }
      });
    });

    const insertTargets = [
      '#gradebook_header_content',
      '#gradebook_header',
      '#speed_grader_loading',
      '#left_side',
      '.submission_header'
    ];

    for (const selector of insertTargets) {
      const target = document.querySelector(selector);
      if (target) {
        target.appendChild(btn);
        return;
      }
    }

    btn.style.cssText = 'position:fixed;bottom:80px;right:20px;z-index:9999';
    document.body.appendChild(btn);
  }

  // ─── Student navigation observer ──────────────────────────────────────
  function watchStudentNavigation() {
    const candidateSelectors = [
      '#students_selectmenu .ui-selectmenu-text',
      '#student_name',
      '.student_name',
      '#students_selectmenu-button .ui-selectmenu-item-header'
    ];

    let observed = false;
    for (const selector of candidateSelectors) {
      const el = document.querySelector(selector);
      if (el) {
        new MutationObserver(() => {
          chrome.runtime.sendMessage({ type: 'STUDENT_CHANGED' }).catch(() => {});
          const btn = document.getElementById('katana-grade-btn');
          if (btn) {
            btn.disabled = false;
            btn.innerHTML = '⚡ Grade with Katana';
          }
        }).observe(el, { childList: true, characterData: true, subtree: true });
        observed = true;
        break;
      }
    }

    if (!observed) {
      let lastUrl = location.href;
      new MutationObserver(() => {
        if (location.href !== lastUrl) {
          lastUrl = location.href;
          chrome.runtime.sendMessage({ type: 'STUDENT_CHANGED' }).catch(() => {});
        }
      }).observe(document.body, { childList: true, subtree: true });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // DATA COLLECTION
  // ═══════════════════════════════════════════════════════════════════════

  async function collectSubmissionData() {
    const [assignmentData, submissionObj] = await Promise.all([
      fetchAssignmentFromAPI(),
      fetchSubmissionFromAPI()
    ]);

    const assignmentTitle = assignmentData?.name || getAssignmentTitleFromDOM();
    const assignmentInstructions = assignmentData?.description
      ? decodeHtmlDescription(assignmentData.description)
      : '';
    const rubric = parseRubricFromAPI(assignmentData) || getRubric();
    const gradingSchema = getGradingSchemaFromAssignment(assignmentData) || getGradingSchema();
    const studentName = submissionObj?.user?.name || getStudentName();
    const submission = await getSubmissionContent(submissionObj);

    return {
      assignmentTitle,
      assignmentInstructions,
      rubric,
      gradingSchema,
      studentName,
      submission,
      dueAt: assignmentData?.due_at || null,
      submittedAt: submissionObj?.submitted_at || null,
      docViewerUrl: getDocViewerUrl()
    };
  }

  // Returns the Canvas canvadoc_session URL from the DocViewer iframe src.
  // The service worker fetches this (with credentials) to follow the redirect
  // and extract the Canvadocs JWT from the final URL.
  function getDocViewerUrl() {
    const iframe = document.getElementById('submission-preview-iframe');
    if (!iframe) return null;
    const src = iframe.src || iframe.getAttribute('src') || '';
    if (!src || !src.includes('canvadoc_session')) return null;
    return src;
  }

  async function fetchSubmissionFromAPI() {
    try {
      const params = new URL(location.href).searchParams;
      const assignmentId = params.get('assignment_id');
      const studentId = params.get('student_id');
      const courseMatch = location.pathname.match(/\/courses\/(\d+)\//);
      const courseId = courseMatch?.[1];
      if (!assignmentId || !courseId || !studentId) return null;
      const resp = await fetch(
        `/api/v1/courses/${courseId}/assignments/${assignmentId}/submissions/${studentId}?include[]=user`,
        { credentials: 'same-origin' }
      );
      return resp.ok ? await resp.json() : null;
    } catch { return null; }
  }

  async function fetchAssignmentFromAPI() {
    try {
      const params = new URL(location.href).searchParams;
      const assignmentId = params.get('assignment_id');
      const courseMatch = location.pathname.match(/\/courses\/(\d+)\//);
      const courseId = courseMatch?.[1];
      if (!assignmentId || !courseId) return null;
      const resp = await fetch(
        `/api/v1/courses/${courseId}/assignments/${assignmentId}?include[]=rubric`,
        { credentials: 'same-origin' }
      );
      if (!resp.ok) return null;
      return await resp.json();
    } catch { return null; }
  }

  function parseRubricFromAPI(assignment) {
    if (!assignment?.rubric || !Array.isArray(assignment.rubric)) return null;
    const criteria = assignment.rubric.map(criterion => {
      const ratings = (criterion.ratings || []).map(r => ({
        id: String(r.id || ''),
        description: r.description || '',
        points: parseFloat(r.points) || 0
      }));
      return {
        id: String(criterion.id || ''),
        description: criterion.description || `Criterion ${criterion.id}`,
        maxPoints: parseFloat(criterion.points) || 0,
        ratings
      };
    });
    return criteria.length > 0 ? { criteria } : null;
  }

  function decodeHtmlDescription(html) {
    const div = document.createElement('div');
    div.innerHTML = html;
    div.querySelectorAll('script, style').forEach(el => el.remove());
    return div.textContent.replace(/\s+/g, ' ').trim().substring(0, 8000);
  }

  function getAssignmentTitleFromDOM() {
    return window.ENV?.ASSIGNMENT?.title || window.ENV?.assignment?.title || 'Untitled Assignment';
  }

  function getGradingSchemaFromAssignment(assignment) {
    if (!assignment) return null;
    return { gradingType: assignment.grading_type || 'points', maxPoints: assignment.points_possible || 100 };
  }

  function getRubric() {
    const container = document.querySelector('#rubric_full, .rubric_container, #rubric_holder');
    if (!container) return null;
    const criteria = [];
    const criterionEls = container.querySelectorAll('.criterion[data-criterion-id], .criterion[id^="criterion_"]');
    criterionEls.forEach(criterionEl => {
      const id = criterionEl.dataset.criterionId || criterionEl.id?.replace('criterion_', '') || String(criteria.length);
      const descEl = criterionEl.querySelector('.description_title, .criterion_description, .description');
      const description = descEl?.textContent?.trim() || `Criterion ${id}`;
      const maxPtsEl = criterionEl.querySelector('.criterion_points .criterion_points, .points');
      const maxPoints = parseFloat(maxPtsEl?.textContent?.trim()) || 0;
      const ratings = [];
      criterionEl.querySelectorAll('.rating[data-rating-id], .rating').forEach(ratingEl => {
        const ratingDescEl = ratingEl.querySelector('.rating_description, .description');
        const ratingPtsEl = ratingEl.querySelector('.points');
        ratings.push({ id: ratingEl.dataset.ratingId || '', description: ratingDescEl?.textContent?.trim() || '', points: parseFloat(ratingPtsEl?.textContent?.trim()) || 0 });
      });
      criteria.push({ id, description, maxPoints, ratings });
    });
    return criteria.length > 0 ? { criteria } : null;
  }

  function getGradingSchema() {
    const envType = window.ENV?.grading_scheme?.grading_type || window.ENV?.RUBRIC_ASSESSMENT?.gradingType || window.ENV?.assignment?.grading_type || window.ENV?.SUBMISSION_DETAILS?.gradingType;
    if (envType) return buildSchema(envType);
    const gradeBox = document.querySelector('#student_grading_box, #grade_container input, #grading-box-extended input, #grading_box_holder input');
    const gradeSelect = document.querySelector('#student_grading_box select, #grade_container select, #grading-box-extended select');
    if (gradeSelect) {
      const options = Array.from(gradeSelect.options).map(o => o.value.toLowerCase());
      if (options.includes('complete') || options.includes('pass')) return buildSchema('pass_fail');
      if (options.some(o => /^[a-f][+-]?$/.test(o))) return buildSchema('letter_grade');
    }
    const maxPts = parseFloat(gradeBox?.getAttribute('aria-valuemax')) || parseFloat(document.querySelector('.points_possible')?.textContent) || 100;
    return { gradingType: 'points', maxPoints: maxPts };
  }

  function buildSchema(type) {
    const maxPts = parseFloat(document.querySelector('.points_possible')?.textContent?.replace(/[^0-9.]/g, '')) || window.ENV?.assignment?.points_possible || 100;
    return { gradingType: type, maxPoints: maxPts };
  }

  function getStudentName() {
    // Prefer ENV / jsonData — these contain the full name reliably
    const envName = window.ENV?.student_name || window.ENV?.SUBMISSION_DETAILS?.student_name || window.ENV?.RUBRIC_ASSESSMENT?.student?.name;
    if (envName) return envName;
    try {
      const jd = window.jsonData;
      if (jd?.studentInformation?.name) return jd.studentInformation.name;
      if (jd?.context?.students) {
        const currentId = window.ENV?.SUBMISSION?.user_id || window.ENV?.student_id;
        if (currentId) {
          const student = jd.context.students.find(s => String(s.id) === String(currentId));
          if (student?.name) return student.name;
        }
      }
    } catch (_) {}
    // Fall back to DOM selectors (may only have first name in some Canvas builds)
    const selectors = ['[data-testid="selected-student"]','[data-testid="student-name"]','[data-testid="students_selectmenu"] [class*="label"]','#students_selectmenu .ui-selectmenu-text span','#students_selectmenu .ui-selectmenu-text','#students_selectmenu-button .ui-selectmenu-item-header','#student_name','.student_name','#student-name'];
    for (const sel of selectors) {
      try { const el = document.querySelector(sel); const text = el?.textContent?.trim(); if (text && text !== 'Student' && text.length > 1) return text; } catch (_) {}
    }
    return 'Student';
  }

  async function getSubmissionContent(submissionObj) {
    const subType = submissionObj?.submission_type || window.ENV?.SUBMISSION_DETAILS?.submissionType || window.ENV?.submission_type || detectSubmissionType();
    switch (subType) {
      case 'online_text_entry': return { type: 'text', content: getTextSubmission(submissionObj) };
      case 'online_upload': { const { text, fileAttachments } = await getFileSubmissionContent(submissionObj); return { type: 'file', content: text, fileAttachments }; }
      case 'online_url': return { type: 'url', content: getUrlSubmission(submissionObj) };
      case 'media_recording': return { type: 'media', content: getMediaSubmissionInfo() };
      default: { const textContent = getTextSubmission(submissionObj); if (textContent) return { type: 'text', content: textContent }; const { text: fileContent, fileAttachments } = await getFileSubmissionContent(submissionObj); if (fileContent || fileAttachments?.length) return { type: 'file', content: fileContent, fileAttachments }; return { type: 'unknown', content: '[Submission content could not be determined]' }; }
    }
  }

  function detectSubmissionType() {
    if (document.querySelector('#submission_file_list .submission_attachment')) return 'online_upload';
    if (document.querySelector('.submission_url, a.submission-file-url')) return 'online_url';
    if (document.querySelector('video, audio')) return 'media_recording';
    if (document.querySelector('#submission-preview-iframe, #speedgrader_iframe')) return 'online_text_entry';
    return 'unknown';
  }

  function getTextSubmission(submissionObj) {
    if (submissionObj?.body) return decodeHtmlDescription(submissionObj.body);
    const iframe = document.querySelector('#submission-preview-iframe, #speedgrader_iframe');
    if (iframe) {
      try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (doc?.body) {
          for (const sel of ['.user_content','#content','main','article','.submission_body','.online_text_entry_submission']) { const el = doc.querySelector(sel); const text = el?.textContent?.trim(); if (text && text.length > 20) return text.substring(0, 10000); }
          const clone = doc.body.cloneNode(true);
          clone.querySelectorAll('script, style, noscript, nav, header, footer').forEach(el => el.remove());
          const text = clone.textContent.trim();
          if (text) return text.substring(0, 10000);
        }
      } catch (e) { console.warn('Katana: could not access submission iframe content', e.message); }
    }
    for (const sel of ['.submission_body','.online_text_entry_submission','#submission_preview','.submission-details .submission_body']) { const el = document.querySelector(sel); if (el?.textContent?.trim()) return el.textContent.trim().substring(0, 10000); }
    return '';
  }

  async function getFileSubmissionContent(submissionObj) {
    const attachments = submissionObj?.attachments || [];
    if (attachments.length > 0) {
      const results = await Promise.all(attachments.map(readAttachment));
      return { text: results.map(r => r.text).filter(Boolean).join('\n\n---\n\n'), fileAttachments: results.map(r => r.fileData).filter(Boolean) };
    }
    const els = document.querySelectorAll('#submission_file_list .submission_attachment, .submission_attachment');
    if (els.length) { const names = Array.from(els).map(el => '- ' + (el.querySelector('.filename, a')?.textContent?.trim() || 'Unknown file')).join('\n'); return { text: `[File submission — content not readable]\nFiles submitted:\n${names}`, fileAttachments: [] }; }
    return { text: '', fileAttachments: [] };
  }

  async function readAttachment(att) {
    const name = att.display_name || att.filename || 'file';
    const mime = att['content-type'] || att.content_type || '';
    const url = att.url;
    if (!url) return { text: `[File: ${name} — no download URL available]`, fileData: null };
    let buffer;
    try { const r = await fetch(url, { credentials: 'same-origin' }); if (!r.ok) throw new Error(`HTTP ${r.status}`); buffer = await r.arrayBuffer(); }
    catch (e) { return { text: `[File: ${name} — download failed: ${e.message}]`, fileData: null }; }
    const isPdf  = /\.pdf$/i.test(name)  || mime.includes('pdf');
    const isDocx = /\.docx$/i.test(name) || mime.includes('wordprocessingml') || mime.includes('officedocument.wordprocessing');
    const isDoc  = /\.doc$/i.test(name)  || (mime.includes('msword') && !/openxml/.test(mime));
    if (mime.startsWith('text/') || /\.(txt|md|csv)$/i.test(name)) return { text: `[File: ${name}]\n${new TextDecoder().decode(buffer).substring(0, 8000)}`, fileData: null };
    if (isPdf && buffer.byteLength <= 20 * 1024 * 1024) { const base64 = arrayBufferToBase64(buffer); return { text: `[File: ${name} — attached as document]`, fileData: { name, base64, mediaType: 'application/pdf' } }; }
    if (isPdf) { const text = await extractPdfText(buffer); if (text?.trim()) return { text: `[File: ${name}]\n${text.substring(0, 8000)}`, fileData: null }; return { text: `[File: ${name} (PDF too large; text extraction failed)]`, fileData: null }; }
    if (isDocx) { const text = await extractDocxText(buffer); if (text?.trim()) return { text: `[File: ${name}]\n${text.substring(0, 8000)}`, fileData: null }; return { text: `[File: ${name} (Word document — text extraction failed; ask student to resubmit as PDF)]`, fileData: null }; }
    if (isDoc) return { text: `[File: ${name} (Word .doc — legacy format, cannot read. Ask student to resubmit as .docx or PDF.)]`, fileData: null };
    const ext = name.split('.').pop()?.toUpperCase() || '';
    return { text: `[File: ${name}${ext ? ` (.${ext})` : ''} — unsupported format]`, fileData: null };
  }

  function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer); const CHUNK = 32768; let binary = '';
    for (let i = 0; i < bytes.length; i += CHUNK) binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + CHUNK, bytes.length)));
    return btoa(binary);
  }

  async function extractDocxText(buffer) {
    try {
      const bytes = new Uint8Array(buffer);
      for (let i = 0; i < bytes.length - 30; i++) {
        if (bytes[i] !== 0x50 || bytes[i+1] !== 0x4B || bytes[i+2] !== 0x03 || bytes[i+3] !== 0x04) continue;
        const method = bytes[i+8] | (bytes[i+9] << 8); const compSize = readU32(bytes, i+18); const fnLen = bytes[i+26] | (bytes[i+27] << 8); const exLen = bytes[i+28] | (bytes[i+29] << 8);
        const fn = new TextDecoder().decode(bytes.slice(i+30, i+30+fnLen));
        if (fn !== 'word/document.xml') continue;
        const dataAt = i + 30 + fnLen + exLen; const compressed = bytes.slice(dataAt, dataAt + compSize);
        let xml = method === 0 ? compressed : method === 8 ? await inflateRaw(compressed) : null;
        if (!xml) return null;
        return docxXmlToText(new TextDecoder('utf-8', { fatal: false }).decode(xml));
      }
    } catch (e) { console.warn('Katana: DOCX extraction error', e.message); }
    return null;
  }

  function readU32(b, o) { return (b[o] | b[o+1]<<8 | b[o+2]<<16 | b[o+3]<<24) >>> 0; }

  async function inflateRaw(data) {
    try {
      const ds = new DecompressionStream('deflate-raw'); const w = ds.writable.getWriter(); const r = ds.readable.getReader();
      w.write(data); w.close();
      const chunks = []; while (true) { const { done, value } = await r.read(); if (done) break; chunks.push(value); }
      const len = chunks.reduce((n, c) => n + c.length, 0); const out = new Uint8Array(len); let p = 0;
      for (const c of chunks) { out.set(c, p); p += c.length; } return out;
    } catch { return null; }
  }

  function docxXmlToText(xml) {
    return xml.replace(/<w:p[ >/]/g, '\n').replace(/<w:br[^>]*\/>/g, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&apos;/g,"'").replace(/&quot;/g,'"').replace(/&#\w+;/g,' ').replace(/\n\s*\n\s*\n/g, '\n\n').trim();
  }

  async function extractPdfText(buffer) {
    try {
      const bytes = new Uint8Array(buffer); const raw = new TextDecoder('latin1').decode(bytes); const chunks = []; let pos = 0;
      while (pos < raw.length) {
        const si = raw.indexOf('stream', pos); if (si === -1) break;
        const ei = raw.indexOf('endstream', si + 6); if (ei === -1) break;
        let ds = si + 6; if (raw[ds] === '\r') ds++; if (raw[ds] === '\n') ds++;
        const dict = raw.substring(Math.max(0, si - 600), si);
        const isFlate = /\/Filter\s*\/FlateDecode/.test(dict) || /\/FlateDecode/.test(dict);
        const hasImageFilter = /\/(DCTDecode|JBIG2Decode|CCITTFaxDecode|JPXDecode)/.test(dict);
        if (!hasImageFilter) { let streamText; if (!isFlate) { streamText = raw.substring(ds, ei); } else { const dec = await inflateZlib(bytes.slice(ds, ei)); if (dec) streamText = new TextDecoder('latin1').decode(dec); } if (streamText) chunks.push(...extractPdfOps(streamText)); }
        pos = ei + 9;
      }
      return chunks.length ? chunks.join(' ').replace(/\s+/g, ' ').trim() : null;
    } catch (e) { console.warn('Katana: PDF extraction error', e.message); return null; }
  }

  async function inflateZlib(data) {
    for (const fmt of ['deflate', 'deflate-raw']) {
      try {
        const ds = new DecompressionStream(fmt); const w = ds.writable.getWriter(); const r = ds.readable.getReader();
        w.write(data); w.close();
        const chunks = []; while (true) { const { done, value } = await r.read(); if (done) break; chunks.push(value); }
        if (!chunks.length) continue;
        const len = chunks.reduce((n, c) => n + c.length, 0); const out = new Uint8Array(len); let p = 0;
        for (const c of chunks) { out.set(c, p); p += c.length; }
        if (out.length > 4) return out;
      } catch (_) {}
    }
    return null;
  }

  function extractPdfOps(stream) {
    const chunks = []; const btEt = /BT\b([\s\S]*?)\bET\b/g; let m;
    while ((m = btEt.exec(stream)) !== null) {
      const block = m[1];
      const tj = /\(([^)\\]*(?:\\.[^)\\]*)*)\)\s*(?:Tj|'|")/g; let t;
      while ((t = tj.exec(block)) !== null) { const s = pdfStr(t[1]); if (s.trim()) chunks.push(s); }
      const TJ = /\[([^\]]+)\]\s*TJ/g;
      while ((t = TJ.exec(block)) !== null) { const parts = /\(([^)\\]*(?:\\.[^)\\]*)*)\)/g; let p; while ((p = parts.exec(t[1])) !== null) { const s = pdfStr(p[1]); if (s.trim()) chunks.push(s); } }
    }
    return chunks;
  }

  function pdfStr(s) { return s.replace(/\\n/g,'\n').replace(/\\r/g,'\r').replace(/\\t/g,'\t').replace(/\\\(/g,'(').replace(/\\\)/g,')').replace(/\\\\/g,'\\').replace(/\\(\d{3})/g,(_,o)=>String.fromCharCode(parseInt(o,8))); }

  function getUrlSubmission(submissionObj) {
    const url = submissionObj?.url || document.querySelector('a.submission-file-url, .submission_url a, a[href*="http"][target="_blank"]')?.href || '';
    if (!url) return '[URL submission — no URL found]';
    return `[URL submission]\nSubmitted URL: ${url}\n\n[Note: The AI cannot visit external URLs. Grade based on assignment context and URL if visible.]`;
  }

  function getMediaSubmissionInfo() {
    const mediaEl = document.querySelector('video, audio');
    const src = mediaEl?.src || mediaEl?.querySelector('source')?.src || '';
    return `[Media recording submission${src ? ` — ${src}` : ''}]\n[Audio/video content cannot be directly analyzed. Grade based on assignment context.]`;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // GRADE APPLICATION
  // ═══════════════════════════════════════════════════════════════════════

  async function applyGrade({ grade, feedback, rubricRatings }) {
    const errors = [];
    try { await fillGradeField(grade); } catch (e) { errors.push(`Grade fill failed: ${e.message}`); }
    try { fillFeedbackField(feedback); } catch (e) { errors.push(`Feedback fill failed: ${e.message}`); }
    if (rubricRatings && rubricRatings.length > 0) { try { await fillRubric(rubricRatings); } catch (e) { errors.push(`Rubric fill failed: ${e.message}`); } }
    if (errors.length > 0) throw new Error(errors.join('; '));
  }

  function setReactInputValue(input, value) {
    if (!input) throw new Error('Input element not found');
    const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    nativeSetter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
  }

  function setReactTextareaValue(textarea, value) {
    if (!textarea) throw new Error('Textarea element not found');
    const nativeSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    nativeSetter.call(textarea, value);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
    textarea.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
  }

  function setReactSelectValue(select, value) {
    if (!select) throw new Error('Select element not found');
    const nativeSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
    nativeSetter.call(select, value);
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }

  async function fillGradeField(grade) {
    const passFail = document.querySelector('[data-testid="pass-fail-select"]');
    if (passFail) return fillCombobox(passFail, normalizePassFail(grade) || String(grade));
    const letterGrade = document.querySelector('[data-testid="letter-grade-select"]');
    if (letterGrade) return fillCombobox(letterGrade, String(grade));
    const gradeInput = document.querySelector('[data-testid="grade-input"]');
    if (gradeInput) { setReactInputValue(gradeInput, String(grade)); return; }
    const legacyInput = document.querySelector('#student_grading_box, #grade_container input.grade, #grading-box-extended input, #grading_box_holder input');
    if (legacyInput) { setReactInputValue(legacyInput, String(grade)); return; }
    const legacySelect = document.querySelector('#student_grading_box select, #grade_container select, #grading-box-extended select');
    if (legacySelect) { const normalised = normalizePassFail(grade) || String(grade); const option = Array.from(legacySelect.options).find(o => o.value.toLowerCase() === normalised.toLowerCase() || o.text.toLowerCase() === normalised.toLowerCase()); if (option) { setReactSelectValue(legacySelect, option.value); return; } }
    throw new Error('Grade input element not found');
  }

  async function fillCombobox(input, value) {
    input.focus();
    input.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    input.click();
    await new Promise(resolve => setTimeout(resolve, 400));
    const allOptions = [...document.querySelectorAll('[role="option"]'),...document.querySelectorAll('[role="listbox"] li'),...document.querySelectorAll('[role="listbox"] [tabindex]')];
    const target = allOptions.find(o => o.textContent.trim().toLowerCase() === value.toLowerCase());
    if (target) { target.click(); return; }
    setReactInputValue(input, value);
    await new Promise(resolve => setTimeout(resolve, 200));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup',  { key: 'Enter', bubbles: true }));
  }

  function normalizePassFail(grade) {
    const g = String(grade).toLowerCase();
    if (g === 'complete' || g === 'pass' || g === 'yes' || g === 'true') return 'Complete';
    if (g === 'incomplete' || g === 'fail' || g === 'no' || g === 'false') return 'Incomplete';
    return null;
  }

  function fillFeedbackField(feedback) {
    const rceIframe = document.querySelector('iframe[id^="rce-"][id$="_ifr"]');
    if (rceIframe) {
      const editorId = rceIframe.id.replace('_ifr', '');
      const tinyMCE = window.tinymce || window.tinyMCE;
      const editor = tinyMCE?.get(editorId);
      if (editor) { editor.setContent(feedback.replace(/\n/g, '<br>')); editor.fire('change'); editor.fire('input'); const hiddenTextarea = document.getElementById(editorId); if (hiddenTextarea) setReactTextareaValue(hiddenTextarea, feedback); return; }
      try { const doc = rceIframe.contentDocument || rceIframe.contentWindow?.document; if (doc?.body) { doc.body.innerHTML = feedback.replace(/\n/g, '<br>'); doc.body.dispatchEvent(new Event('input', { bubbles: true })); const hiddenTextarea = document.getElementById(editorId); if (hiddenTextarea) setReactTextareaValue(hiddenTextarea, feedback); return; } } catch (e) { console.warn('Katana: could not write to RCE iframe', e.message); }
    }
    const textarea = document.querySelector('#speedgrader_comment_textarea, #comment_text, textarea[name="comment[text_comment]"]');
    if (textarea) { setReactTextareaValue(textarea, feedback); return; }
    throw new Error('Feedback field not found (no TinyMCE iframe or plain textarea)');
  }

  async function fillRubric(rubricRatings) {
    // Helper: wait for an element to appear in the DOM (MutationObserver)
    function waitForEl(sel, ms = 3000) {
      return new Promise(resolve => {
        const el = document.querySelector(sel);
        if (el) { resolve(el); return; }
        const t = setTimeout(() => { obs.disconnect(); resolve(null); }, ms);
        const obs = new MutationObserver(() => {
          const found = document.querySelector(sel);
          if (found) { obs.disconnect(); clearTimeout(t); resolve(found); }
        });
        obs.observe(document.body, { childList: true, subtree: true });
      });
    }

    // ── Step 1: ensure rubric panel is visible ──────────────────────────
    // Canvas hides the rubric by default — instructor must click "View Rubric".
    const rubricFull = document.querySelector('#rubric_full');
    const isHidden = !rubricFull ||
      rubricFull.style.display === 'none' ||
      rubricFull.classList.contains('hidden') ||
      window.getComputedStyle(rubricFull).display === 'none';

    if (isHidden) {
      // Canvas SpeedGrader uses .toggle_full_rubric for the "View Rubric" button
      const toggle = document.querySelector(
        '.toggle_full_rubric, button.assess_submission_link, ' +
        '#rubric_assessments_list_and_edit_button_holder .edit, ' +
        'a.toggle_rubric_assessments'
      );
      if (toggle) {
        toggle.click();
        await waitForEl(
          '.rubric_container.assessing, .rubric_container, ' +
          '[data-testid="enhanced-rubric-assessment-container"]',
          3000
        );
      }
    }

    // ── Step 2: find the rubric container ──────────────────────────────
    // Classic: #rubric_full .rubric_container.assessing  (.assessing = assessment mode)
    // Enhanced: [data-testid="enhanced-rubric-assessment-container"]
    const container = document.querySelector(
      '#rubric_full .rubric_container.assessing, ' +
      '#rubric_full .rubric_container, ' +
      '.rubric_container, #rubric_full, #rubric_holder, ' +
      '[data-testid="enhanced-rubric-assessment-container"]'
    );
    if (!container) { console.warn('Katana: rubric container not found'); return; }

    // ── Step 3: fill each criterion ────────────────────────────────────
    for (const { criterion_id, points, comments } of rubricRatings) {
      // Canvas uses id="criterion_{id}" on <tr> elements (classic rubric).
      // Also try data-criterion-id for enhanced rubric.
      const criterionEl = container.querySelector(
        `#criterion_${criterion_id}, ` +
        `tr#criterion_${criterion_id}, ` +
        `.criterion[data-criterion-id="${criterion_id}"], ` +
        `tr[data-criterion-id="${criterion_id}"]`
      );
      if (!criterionEl) { console.warn(`Katana: criterion ${criterion_id} not found`); continue; }

      // Classic rubric: div.rating-tier inside each <td>
      // Enhanced: [data-testid^="rubric-rating-button-"]
      const ratingEls = criterionEl.querySelectorAll(
        'div.rating-tier, .rating-tier, .rating, td.rating, ' +
        '[data-testid^="rubric-rating-button-"], button[data-points]'
      );

      // Pick the rating closest to the target points
      let bestMatch = null;
      let bestDiff = Infinity;
      ratingEls.forEach(el => {
        const ptsEl = el.querySelector('.rating-points, .points, [class*="points"]');
        const rawPts = ptsEl?.textContent?.trim().replace(/[^0-9.-]/g, '') ||
                       el.dataset.points || '';
        const numPts = parseFloat(rawPts);
        if (isNaN(numPts)) return;
        const diff = Math.abs(numPts - points);
        if (diff < bestDiff) { bestDiff = diff; bestMatch = el; }
      });

      if (bestMatch) {
        // Canvas React rubric responds to Event('click') with bubbles: true
        bestMatch.dispatchEvent(new Event('click', { bubbles: true }));
        await new Promise(r => setTimeout(r, 100));
      } else {
        console.warn(`Katana: no rating match for criterion ${criterion_id} (${points} pts)`);
      }

      // Comments: enhanced rubric has inline textareas; classic uses a dialog
      if (comments) {
        const commentArea = criterionEl.querySelector(
          `[data-testid="comment-text-area-${criterion_id}"], ` +
          `[data-testid="free-form-comment-area-${criterion_id}"], ` +
          'textarea.criterion_comments, .custom_rating_comments textarea'
        );
        if (commentArea) setReactTextareaValue(commentArea, comments);
      }
    }
  }

  // ─── Initialise ───────────────────────────────────────────────────────
  function init() {
    const ready = () => { injectKatanaButton(); watchStudentNavigation(); };
    if (document.readyState === 'complete' || document.readyState === 'interactive') { ready(); }
    else { document.addEventListener('DOMContentLoaded', ready); }
    let retries = 0;
    const retryInterval = setInterval(() => {
      if (document.getElementById('katana-grade-btn') || retries++ > 20) { clearInterval(retryInterval); return; }
      injectKatanaButton();
    }, 500);
  }

  init();
})();
