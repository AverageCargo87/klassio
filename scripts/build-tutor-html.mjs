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
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, resolve, join } from 'node:path'
import { createHash } from 'node:crypto'
import sharp from 'sharp'

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
  "window.__KLASSIO_LIVE=true;window.__klassioChildName='Ты';" +
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
          var b = makeBubble({ w: w, t: t });
          // child label = the name the child told Аня (fallback «Ты»), not the
          // demo's hard-coded «Макс».
          if (w === 'child') { var who0 = b.querySelector('.who'); if (who0) who0.textContent = window.__klassioChildName || 'Ты'; }
          if (w === 'tutor') { var who1 = b.querySelector('.who'); if (who1) who1.textContent = window.__klassioTutorName || 'Аня'; }
          chat.appendChild(b); toBottom();
          setStatus(w === 'tutor' ? 'speaking' : 'listening');
          if (RM) { revealWords(b); return; }
          // Type-in: starts immediately (when she starts speaking) but the words
          // "run" gently so the chat reads at a calm pace alongside her voice.
          var words = b.querySelectorAll('.w'); var stg = 0.06;
          gsap.fromTo(b, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: .2, ease: 'power3.out' });
          gsap.fromTo(words, { opacity: 0, y: 6, filter: 'blur(4px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: .45, stagger: stg, ease: 'power3.out', onUpdate: toBottom });
          setTimeout(function () { revealWords(b); toBottom(); }, words.length * (stg * 1000) + 600);
        } catch (e) { console.error('[klassio] pushBubble', e); }
      },
      setChildName: function (name) {
        try {
          if (!name) return;
          window.__klassioChildName = String(name).trim();
          document.querySelectorAll('#chat .bubble.child .who').forEach(function (el) { el.textContent = window.__klassioChildName; });
        } catch (e) {}
      },
      // Set the TEACHER's display name everywhere: the avatar letter (CSS
      // ::before, overridden via an injected <style>) + every tutor bubble label.
      // Lets each voice be a distinct named teacher (Надя / Аня / Рина).
      setTeacherName: function (name) {
        try {
          if (!name) return;
          window.__klassioTutorName = String(name).trim();
          var L = window.__klassioTutorName.charAt(0).toUpperCase();
          document.querySelectorAll('#chat .bubble:not(.child) .who').forEach(function (el) { el.textContent = window.__klassioTutorName; });
          var st = document.getElementById('klassio-av-letter');
          if (!st) { st = document.createElement('style'); st.id = 'klassio-av-letter'; document.head.appendChild(st); }
          st.textContent = '.av-mini .disc::before{content:"' + L + '"!important}';
        } catch (e) {}
      },
      setMuted: function (m) { try { setMuted(!!m); } catch (e) {} },
      showStartButton: function () { var el = document.getElementById('klassio-start'); if (el) el.style.display = 'flex'; },
      hideStartButton: function () { var el = document.getElementById('klassio-start'); if (el) el.style.display = 'none'; },
      setStartButtonText: function (txt, disabled) { try { var w = document.getElementById('klassio-start'); if (!w) return; var b = w.querySelector('button'); if (!b) return; b.textContent = txt; b.disabled = !!disabled; b.style.opacity = disabled ? '0.65' : '1'; } catch (e) {} },
      startTimer: function () { try { if (window.__klassioTimerStarted) return; window.__klassioTimerStarted = true; startTimer(); } catch (e) {} },
      setVoiceMenu: function (voices, selectedKey) {
        try {
          var m = document.getElementById('klassio-voice-menu'); if (!m) return;
          m.innerHTML = '';
          (voices || []).forEach(function (v) {
            var b = document.createElement('button');
            b.textContent = v.label;
            b.style.cssText = 'border:none;border-radius:10px;padding:8px 14px;font-size:13px;font-weight:700;cursor:pointer;text-align:left;white-space:nowrap;background:' + (v.key === selectedKey ? 'var(--accent)' : 'transparent') + ';color:' + (v.key === selectedKey ? '#fff' : '#3a3a3a');
            b.onclick = function (e) { e.stopPropagation(); if (window.__klassioEngine && window.__klassioEngine.onVoiceSelect) window.__klassioEngine.onVoiceSelect(v.key); };
            m.appendChild(b);
          });
        } catch (e) {}
      },
      onStart: null,
      onWrong: null,
      onVoiceSelect: null,
      onPlanetClick: null,
      onMute: null,
      onSolve: null,
    };
    /* mic button = MUTE/UNMUTE only (never starts/ends the lesson). Toggles the
       design's own visual mute, then notifies React to mute the live SDK. */
    micBtn.onclick = function () { setMuted(!muted); if (window.__klassioEngine.onMute) window.__klassioEngine.onMute(muted); };
    /* in-design START button: a clone of the test buttons (class .submit-btn →
       inherits the design CSS + ButtonFX hover/press animation), coloured like
       the mic (var(--accent)). React registers __klassioEngine.onStart. */
    (function () {
      var wrap = document.createElement('div');
      wrap.id = 'klassio-start';
      // hidden until React has wired onStart (avoids a dead click during the
      // big iframe load), then shown by the React status effect.
      wrap.style.cssText = 'position:fixed;inset:0;display:none;align-items:center;justify-content:center;z-index:60;pointer-events:none';
      var b = document.createElement('button');
      b.className = 'submit-btn';
      b.textContent = 'Начать урок';
      b.style.cssText = 'pointer-events:auto;background:var(--accent);color:#fff;font-size:23px;font-weight:800;padding:30px 62px;border:none;cursor:pointer;line-height:1.1';
      b.onclick = function () { if (window.__klassioEngine && window.__klassioEngine.onStart) window.__klassioEngine.onStart(); };
      wrap.appendChild(b); document.body.appendChild(wrap);
    })();
    /* wrong-answer signal: the design marks a wrong option .wrong/.bad but gives
       no callback — observe it and notify React so Аня can help (not stay silent). */
    (function () {
      var lastWrong = 0;
      var mo = new MutationObserver(function (muts) {
        for (var i = 0; i < muts.length; i++) {
          var t = muts[i].target;
          if (t && t.classList && (t.classList.contains('wrong') || t.classList.contains('bad'))) {
            var now = Date.now();
            if (now - lastWrong < 1500) return;
            lastWrong = now;
            if (window.__klassioEngine && window.__klassioEngine.onWrong) { try { window.__klassioEngine.onWrong(); } catch (e) {} }
            return;
          }
        }
      });
      mo.observe(toolZone, { subtree: true, attributes: true, attributeFilter: ['class'] });
    })();
    /* voice picker as a hover-dropdown on Аня's avatar (.av-mini) in the header. */
    (function () {
      var av = document.querySelector('.av-mini');
      if (!av) return;
      av.style.position = 'relative'; av.style.cursor = 'pointer';
      var menu = document.createElement('div');
      menu.id = 'klassio-voice-menu';
      menu.style.cssText = 'position:absolute;top:calc(100% + 10px);left:50%;transform:translate(-50%,-6px);background:#fff;border-radius:14px;box-shadow:0 10px 28px rgba(0,0,0,.18);padding:6px;display:flex;flex-direction:column;gap:3px;opacity:0;pointer-events:none;transition:opacity .22s ease, transform .22s ease;z-index:90';
      av.appendChild(menu);
      av.addEventListener('mouseenter', function () { menu.style.opacity = '1'; menu.style.transform = 'translate(-50%,0)'; menu.style.pointerEvents = 'auto'; });
      av.addEventListener('mouseleave', function () { menu.style.opacity = '0'; menu.style.transform = 'translate(-50%,-6px)'; menu.style.pointerEvents = 'none'; });
    })();
    /* wire the design's own «Выйти» button → leave to the cabinet (React cleanup
       ends the voice session). */
    (function () {
      var ex = document.querySelector('.exit');
      if (ex) ex.onclick = function () { try { window.top.location.href = '/cabinet/okr-mir-4'; } catch (e) { window.location.href = '/cabinet/okr-mir-4'; } };
    })();
    /* planet/sun clicks on the Solar-System board → tell Аня so she narrates
       (CAPTURE phase: the design calls stopPropagation() on the planet button). */
    (function () {
      var last = 0;
      document.addEventListener('click', function (e) {
        var t = e.target;
        while (t && t.nodeType === 1) {
          if (t.classList && t.classList.contains('p3')) {
            var lbl = t.querySelector('.p3-lbl');
            var name = ((lbl && lbl.textContent) ? lbl.textContent : (t.title || '')).trim();
            var now = Date.now();
            if (name && now - last > 800) {
              last = now;
              if (window.__klassioEngine && window.__klassioEngine.onPlanetClick) { try { window.__klassioEngine.onPlanetClick(name); } catch (e2) {} }
            }
            return;
          }
          t = t.parentNode;
        }
      }, true);
    })();
  }`
replaceOnce(INIT_END, ENGINE_API, 'engine-api')

// ── 3. Notify the React layer when a trainer task is solved ──────────────────
const ONSOLVED =
  '  function onTaskSolved(step) {\n    if (solvedTasks.has(step.id)) return; solvedTasks.add(step.id);'
const ONSOLVED_HOOK =
  '  function onTaskSolved(step) {\n' +
  // LIVE: notify React (once) and RETURN — skip the demo\'s hard-coded "explain"
  // bubble; the real Аня reacts via voice + her own chat message instead.
  '    if (window.__KLASSIO_LIVE) { if (!solvedTasks.has(step.id)) { solvedTasks.add(step.id); if (window.__klassioEngine && window.__klassioEngine.onSolve) { try { window.__klassioEngine.onSolve(step); } catch (e) {} } } return; }\n' +
  '    if (solvedTasks.has(step.id)) return; solvedTasks.add(step.id);'
replaceOnce(ONSOLVED, ONSOLVED_HOOK, 'onsolve-hook')

// ── 4. Lesson timer starts on CONNECT, not on page-load ──────────────────────
const TIMER_CALL = '    // таймер урока — идёт с открытия\n    startTimer();'
const TIMER_REPLACE = '    // KLASSIO-LIVE: таймер стартует при подключении учителя (engine.startTimer)'
replaceOnce(TIMER_CALL, TIMER_REPLACE, 'timer-on-connect')

// ── 5. Externalize + shrink embedded images (30 MB → ~1-2 MB) ────────────────
// 98% of the page is base64 PNGs (planets at 1254px). Pull each out to a file
// under public/tutor/assets, downscale to ≤768px, convert to WebP (alpha-safe),
// and replace the data: URI with a URL. The page HTML itself drops to ~540 KB →
// it loads instantly (and the Start button no longer races a multi-MB download).
const ASSETS = resolve(process.cwd(), 'public/tutor/assets')
rmSync(ASSETS, { recursive: true, force: true })
mkdirSync(ASSETS, { recursive: true })

const DATA_URI = /data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=]+)/g
const urlByB64 = new Map()
let origBytes = 0
let outBytes = 0
for (const mm of html.matchAll(DATA_URI)) {
  const ext = mm[1]
  const b64 = mm[2]
  if (urlByB64.has(b64)) continue
  const buf = Buffer.from(b64, 'base64')
  // Keep small images (<40 KB) inline — they're cheap and some (the canvas-drawn
  // mini-earth that fills the Sun) need to be available without a network fetch.
  if (buf.length < 40_000) continue
  origBytes += buf.length
  const hash = createHash('sha1').update(b64).digest('hex').slice(0, 12)
  let out
  let name
  try {
    out = await sharp(buf)
      .resize({ width: 768, height: 768, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 86 })
      .toBuffer()
    name = `a${hash}.webp`
  } catch {
    // Fallback: keep the original bytes/format (still externalized).
    out = buf
    name = `a${hash}.${ext === 'jpeg' ? 'jpg' : ext}`
  }
  writeFileSync(join(ASSETS, name), out)
  outBytes += out.length
  urlByB64.set(b64, `/tutor/assets/${name}`)
}
html = html.replace(DATA_URI, (full, _ext, b64) => urlByB64.get(b64) || full)
console.log(
  `[build-tutor] externalized ${urlByB64.size} images: ${(origBytes / 1e6).toFixed(1)}MB → ${(outBytes / 1e6).toFixed(2)}MB (in /public/tutor/assets)`,
)

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, html, 'utf8')
console.log(`[build-tutor] wrote ${OUT} (${(html.length / 1e6).toFixed(2)} MB)`)
