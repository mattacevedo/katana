// content/canvadocs.js
// Injected into canvadocs.instructure.com iframe frames (all_frames: true).
// Provides page count and text position lookups for inline annotation placement.
// The service worker queries this script directly using chrome.tabs.sendMessage
// with the canvadocs frame's frameId (obtained via chrome.webNavigation.getAllFrames).

'use strict';

// ─── Readiness: wait for PDF.js to render at least one page ──────────────
let _readyResolve;
const pagesReady = new Promise(r => { _readyResolve = r; });

function checkReady() {
  if (document.querySelectorAll('.page[data-page-number]').length > 0) {
    _readyResolve();
  }
}

// Watch for PDF.js inserting page elements
const _readyObserver = new MutationObserver(checkReady);
_readyObserver.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('load', checkReady);
checkReady(); // resolve immediately if already rendered

pagesReady.then(() => _readyObserver.disconnect());

// ─── Message handler ──────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const timeout = new Promise(r => setTimeout(r, 4000));

  if (message.type === 'CANVADOCS_GET_PAGE_COUNT') {
    Promise.race([pagesReady, timeout]).then(() => {
      const count = document.querySelectorAll('.page[data-page-number]').length;
      sendResponse({ count });
    });
    return true; // async
  }

  if (message.type === 'CANVADOCS_FIND_TEXT_POSITIONS') {
    Promise.race([pagesReady, timeout]).then(() => {
      const results = (message.quotes || []).map(({ quote, page }) =>
        findTextPosition(quote, page)
      );
      sendResponse({ results });
    });
    return true; // async
  }
});

// ─── Text position finder ─────────────────────────────────────────────────
// Returns { found, page, coords, allCoords } or { found: false }
function findTextPosition(quote, preferredPage) {
  const allPages = Array.from(document.querySelectorAll('.page[data-page-number]'));
  if (!allPages.length) return { found: false };

  const normQuote = normalizeText(quote);
  if (!normQuote) return { found: false };

  // Search preferred page first, then all others
  const searchOrder = [
    ...allPages.filter(p => parseInt(p.dataset.pageNumber) === preferredPage),
    ...allPages.filter(p => parseInt(p.dataset.pageNumber) !== preferredPage)
  ];

  for (const pageEl of searchOrder) {
    const pageNum = parseInt(pageEl.dataset.pageNumber); // 1-indexed
    const result = searchPageForText(pageEl, pageNum, normQuote);
    if (result) return result;
  }

  return { found: false };
}

function searchPageForText(pageEl, pageNum, normQuote) {
  const textLayer = pageEl.querySelector('.textLayer');
  if (!textLayer) return null;

  const spans = Array.from(textLayer.querySelectorAll('span')).filter(s =>
    s.textContent.trim() && getComputedStyle(s).visibility !== 'hidden'
  );
  if (!spans.length) return null;

  // Build full-text string with span position tracking
  let fullText = '';
  const spanRanges = [];
  for (const span of spans) {
    const t = span.textContent;
    spanRanges.push({ span, start: fullText.length, end: fullText.length + t.length });
    fullText += t;
    // PDF.js doesn't always include word-boundary spaces between spans
    if (t.length && t[t.length - 1] !== ' ') fullText += ' ';
  }

  const normFull = normalizeText(fullText);
  const idx = normFull.indexOf(normQuote);
  if (idx === -1) return null;

  const matchEnd = idx + normQuote.length;
  const matchedSpans = spanRanges.filter(({ start, end }) => end > idx && start < matchEnd);
  if (!matchedSpans.length) return null;

  // Get rects relative to page container
  const pageRect = pageEl.getBoundingClientRect();
  const rawRects = matchedSpans
    .map(({ span }) => {
      const r = span.getBoundingClientRect();
      return {
        left:   r.left   - pageRect.left,
        top:    r.top    - pageRect.top,
        right:  r.right  - pageRect.left,
        bottom: r.bottom - pageRect.top
      };
    })
    .filter(r => r.right > r.left && r.bottom > r.top);

  if (!rawRects.length) return null;

  const lineRects = mergeToLines(rawRects);
  const allCoords = toPdfCoords(lineRects, pageEl, pageNum);
  if (!allCoords.length) return null;

  return {
    found: true,
    page: pageNum,
    coords: allCoords[0],   // first (usually only) line
    allCoords
  };
}

// ─── Merge overlapping rects into per-line bounding boxes ─────────────────
function mergeToLines(rects) {
  const sorted = [...rects].sort((a, b) => a.top - b.top);
  const lines = [];
  let cur = { ...sorted[0] };

  for (let i = 1; i < sorted.length; i++) {
    const r = sorted[i];
    const curH = cur.bottom - cur.top;
    const overlapH = Math.min(cur.bottom, r.bottom) - Math.max(cur.top, r.top);
    if (curH > 0 && overlapH / curH > 0.4) {
      // Same line — extend
      cur.left   = Math.min(cur.left,   r.left);
      cur.right  = Math.max(cur.right,  r.right);
      cur.top    = Math.min(cur.top,    r.top);
      cur.bottom = Math.max(cur.bottom, r.bottom);
    } else {
      lines.push(cur);
      cur = { ...r };
    }
  }
  lines.push(cur);
  return lines;
}

// ─── Convert CSS rects → PDF quad-point coordinates ──────────────────────
// Returns array of 8-element arrays: [x0,y0, x1,y1, x2,y2, x3,y3]
// Quad order: bottom-left, bottom-right, top-left, top-right
// PDF coordinate space: origin at bottom-left, y increases upward.
function toPdfCoords(lineRects, pageEl, pageNum) {
  // Preferred: use PDF.js viewport API for accurate conversion
  const viewer = window.PDFViewerApplication?.pdfViewer;
  if (viewer) {
    try {
      const pageView = viewer.getPageView(pageNum - 1); // 0-indexed
      const vp = pageView?.viewport;
      if (vp?.convertToPdfPoint) {
        return lineRects.map(rect => quadFromViewport(vp, rect));
      }
    } catch (_) {}
  }

  // Fallback: geometric ratio using rendered page container dimensions
  const cssW = pageEl.clientWidth  || 612;
  const cssH = pageEl.clientHeight || 792;

  // Try to infer PDF page dimensions from canvas aspect ratio
  const canvas = pageEl.querySelector('canvas');
  let pdfW = 612, pdfH = 792; // letter fallback
  if (canvas?.width && canvas?.height) {
    const dpr = window.devicePixelRatio || 1;
    const aspect = (canvas.height / dpr) / (canvas.width / dpr);
    pdfW = 612;
    pdfH = Math.round(612 * aspect);
  }

  return lineRects.map(rect => {
    const scaleX = pdfW / cssW;
    const scaleY = pdfH / cssH;
    const x1 = rect.left  * scaleX;
    const x2 = rect.right * scaleX;
    const y1 = pdfH - rect.top    * scaleY; // flip Y: CSS top → PDF top (larger y)
    const y2 = pdfH - rect.bottom * scaleY; // flip Y: CSS bottom → PDF bottom (smaller y)
    // Quad: bottom-left, bottom-right, top-left, top-right
    return [x1, y2, x2, y2, x1, y1, x2, y1];
  });
}

function quadFromViewport(viewport, rect) {
  // convertToPdfPoint maps CSS-pixel coords (relative to page container) → PDF points
  const [x1, y1] = viewport.convertToPdfPoint(rect.left,  rect.top);
  const [x2, y2] = viewport.convertToPdfPoint(rect.right, rect.bottom);
  // After conversion, larger y = higher on page (PDF origin is bottom-left)
  const pdfX1   = Math.min(x1, x2);
  const pdfX2   = Math.max(x1, x2);
  const pdfYTop = Math.max(y1, y2); // top of text
  const pdfYBot = Math.min(y1, y2); // bottom of text
  // Quad: bottom-left, bottom-right, top-left, top-right
  return [pdfX1, pdfYBot, pdfX2, pdfYBot, pdfX1, pdfYTop, pdfX2, pdfYTop];
}

// ─── Text normalization ───────────────────────────────────────────────────
function normalizeText(text) {
  return text
    .replace(/[\u2018\u2019]/g, "'")   // smart single quotes
    .replace(/[\u201C\u201D]/g, '"')   // smart double quotes
    .replace(/\u2013|\u2014/g, '-')    // en/em dashes
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
