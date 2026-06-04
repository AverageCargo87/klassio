// scripts/build-tutor-html.mjs
//
// Generates public/tutor/anya.html from the Claude-Design source
// (.tmp/sketches/tutor/anya-tutor-clean.html) WITHOUT editing the source on
// disk. It performs three surgical, NON-VISUAL injections so a live AI teacher
// can drive the design's own engine:
//
//   1. Suppress the scripted auto-play (the demo hardcodes Аня's lines in
//      window.LESSON). We stash the real lesson and blank LESSON so the engine
//      boots to an idle stage; live voice drives everything.
//   2. Expose window.__klassioEngine at the END of the engine's init() — a thin
//      API over the engine's OWN private functions (setStatus, showTool,
//      makeBubble typing, slideAside…). The mic button is rewired to a live
//      start/stop callback the React layer registers.
//   3. Notify the React layer when a trainer task is solved (for tracking).
//
// The design's markup / CSS / animations are untouched. Run: node scripts/build-tutor-html.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const SRC = resolve(process.cwd(), '.tmp/sketches/tutor/anya-tutor-clean.html')
const OUT = resolve(process.cwd(), 'public/tutor/anya.html')

// Normalize CRLF→LF so multi-line injection targets match regardless of the
// source's line endings (non-visual; HTML is whitespace-insensitive here).
let html = readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n')

function replaceOnce(needle, replacement, label) {
  const i = html.indexOf(needle)
  if (i === -1) throw new Error(`[build-tutor] injection target NOT FOUND: ${label}`)
  if (html.indexOf(needle, i + needle.length) !== -1) {
    console.warn(`[build-tutor] WARNING: target appears >1×, replacing first: ${label}`)
  }
  html = html.slice(0, i) + replacement + html.slice(i + needle.length)
  console.log(`[build-tutor] injected: ${label}`)
}

// ── 1. Suppress scripted auto-play (inject right before the lesson engine) ───
const ENGINE_OPEN =
  '<script>// ============ Движок урока: шаги, ключевой жест, печать, глоссарий, навигация ============'
const SUPPRESS =
  '<script>/*KLASSIO-LIVE*/' +
  'window.__KLASSIO_REAL_LESSON=window.LESSON;' +
  "window.LESSON=[{type:'say',section:'',board:null,status:'listening',lines:[]}];" +
  'window.__KLASSIO_LIVE=true;' +
  '</script>\n'
replaceOnce(ENGINE_OPEN, SUPPRESS + ENGINE_OPEN, 'suppress-autoplay')

// ── 2. Expose the engine API at the end of init() + rewire the mic ───────────
// These run INSIDE init(), so they see the engine's private scope: setStatus,
// showTool, hideTool, makeBubble, revealWords, toBottom, slideAside/Center,
// setMuted, chat, micBtn, RM, chatAside, muted — plus global gsap / window.Tools.
const INIT_END = '    goTo(0, false);\n  }'
const ENGINE_API = `    goTo(0, false);
    /*KLASSIO-LIVE-API*/
    window.__klassioEngine = {
      setStatus: function (s) { try { setStatus(s); } catch (e) {} },
      setCaption: function (txt) { try { var c = document.querySelector('.mic-cap'); if (c) c.textContent = txt; } catch (e) {} },
      showBoard: function (variant, animate) {
        try { if (!chatAside) slideAside(animate !== false); showTool({ type: 'say', board: variant }, animate !== false); }
        catch (e) { console.error('[klassio] showBoard', e); }
      },
      showTask: function (step, animate) {
        try { if (!chatAside) slideAside(animate !== false); showTool(Object.assign({ type: 'task' }, step), animate !== false); }
        catch (e) { console.error('[klassio] showTask', e); }
      },
      hideTool: function (animate) { try { slideCenter(animate !== false); hideTool(animate !== false); } catch (e) {} },
      pushBubble: function (w, t) {
        try {
          var b = makeBubble({ w: w, t: t }); chat.appendChild(b); toBottom();
          setStatus(w === 'tutor' ? 'speaking' : 'listening');
          if (RM) { revealWords(b); return; }
          var words = b.querySelectorAll('.w'); var stg = w === 'tutor' ? 0.09 : 0.04;
          gsap.fromTo(b, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: .35, ease: 'power3.out' });
          gsap.fromTo(words, { opacity: 0, y: 8, filter: 'blur(5px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: .5, stagger: stg, ease: 'power3.out', onUpdate: toBottom });
          setTimeout(function () { revealWords(b); toBottom(); }, words.length * (stg * 1000) + 900);
        } catch (e) { console.error('[klassio] pushBubble', e); }
      },
      setMuted: function (m) { try { setMuted(!!m); } catch (e) {} },
      onMute: null,
      onSolve: null,
    };
    /* mic button = MUTE/UNMUTE only (never starts/ends the lesson). Toggles the
       design's own visual mute, then notifies React to mute the live SDK. */
    micBtn.onclick = function () { setMuted(!muted); if (window.__klassioEngine.onMute) window.__klassioEngine.onMute(muted); };
  }`
replaceOnce(INIT_END, ENGINE_API, 'engine-api')

// ── 3. Notify the React layer when a trainer task is solved ──────────────────
const ONSOLVED =
  '  function onTaskSolved(step) {\n    if (solvedTasks.has(step.id)) return; solvedTasks.add(step.id);'
const ONSOLVED_HOOK =
  '  function onTaskSolved(step) {\n' +
  '    if (window.__KLASSIO_LIVE && window.__klassioEngine && window.__klassioEngine.onSolve) { try { window.__klassioEngine.onSolve(step); } catch (e) {} }\n' +
  '    if (solvedTasks.has(step.id)) return; solvedTasks.add(step.id);'
replaceOnce(ONSOLVED, ONSOLVED_HOOK, 'onsolve-hook')

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, html, 'utf8')
console.log(`[build-tutor] wrote ${OUT} (${(html.length / 1e6).toFixed(1)} MB)`)
