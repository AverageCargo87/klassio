// scripts/ru-voice-live-stream.mjs (THROWAWAY — STREAMING RU-stack voice demo, NOT integrated)
//
// Streaming upgrade of ru-voice-live.mjs (per .planning/SESSION-2026-06-09-LATENCY-RU-STACK.md → NEXT).
// Goal: first sound earlier + "speaks while thinking", WITHOUT gRPC. Expected ~3.2s → ~2.2–2.5s felt.
//
// What changed vs the baseline (ru-voice-live.mjs):
//   • Transport: curl-per-call → node native https with ONE keepAlive agent (rejectUnauthorized:false
//     for the Russian Trusted Root CA). Verified by scripts/probe-node-https-sber.mjs (3/3 pass).
//   • LLM: GigaChat stream:true (SSE) — tokens read as they arrive, accumulated into SENTENCES (. ! ? …).
//   • TTS per-sentence: each finished sentence is synthesized immediately (short = fast) and pushed to the
//     browser while the LLM is still generating the rest → "speaks while thinking".
//   • Browser: /turn is now an NDJSON chunked stream; the browser plays an ordered audio queue (onended→next).
//     First chunk plays while later sentences are still being synthesized.
//   • STT: UNCHANGED — REST whole-utterance (streaming STT = gRPC, a separate project).
//   • VAD end-of-turn silence trimmed 900ms → 700ms (felt-latency win; tune in the browser: 900 safe / 500 aggressive).
//
// Baseline still lives at scripts/ru-voice-live.mjs for A/B (run it manually on the same port — one at a time).
//
// Run:  node scripts/ru-voice-live-stream.mjs   → opens http://localhost:8123
//       (or double-click START-VOICE-TEST.bat — no VPN / Claude Code needed; only talks to Sber)
import http from 'node:http'
import https from 'node:https'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

const PORT = 8123
const VOICE = 'Nec_24000' // female, Кратову зашёл (см. handoff)

const env = readFileSync('.env.local', 'utf8')
const SALUTE_KEY = (env.match(/^SALUTESPEECH_AUTH_KEY=(.*)$/m) || [])[1]?.trim()
const GIGA_KEY = (env.match(/^GIGACHAT_AUTH_KEY=(.*)$/m) || [])[1]?.trim()
if (!SALUTE_KEY || !GIGA_KEY) { console.error('Need SALUTESPEECH_AUTH_KEY and GIGACHAT_AUTH_KEY in .env.local'); process.exit(1) }

// ONE shared agent → TLS connections reused across STT/LLM/TTS calls (the big curl-per-call win).
const agent = new https.Agent({ keepAlive: true, rejectUnauthorized: false, maxSockets: 16 })

// --- generic buffered node-https request (OAuth / STT / TTS) ---
function req(url, { method = 'GET', headers = {}, body = null, timeout = 40000 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const t0 = Date.now()
    let ttfb = null
    const r = https.request({ hostname: u.hostname, port: u.port || 443, path: u.pathname + u.search, method, headers, agent }, (res) => {
      const chunks = []
      res.on('data', (c) => { if (ttfb == null) ttfb = Date.now() - t0; chunks.push(c) })
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks), ttfb }))
    })
    r.on('error', reject)
    r.setTimeout(timeout, () => r.destroy(new Error('https timeout ' + timeout + 'ms')))
    if (body) r.write(body)
    r.end()
  })
}

// --- OAuth (30-min Bearer per scope) ---
const oauth = async (key, scope) => {
  const r = await req('https://ngw.devices.sberbank.ru:9443/api/v2/oauth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json', 'RqUID': randomUUID(), 'Authorization': 'Basic ' + key },
    body: 'scope=' + encodeURIComponent(scope), timeout: 20000,
  })
  if (r.status !== 200) throw new Error(`OAuth ${scope} HTTP ${r.status}: ${r.body.toString().slice(0, 160)}`)
  return JSON.parse(r.body.toString()).access_token
}
let salTok, gigTok, tokAt = 0
const refresh = async () => { salTok = await oauth(SALUTE_KEY, 'SALUTE_SPEECH_PERS'); gigTok = await oauth(GIGA_KEY, 'GIGACHAT_API_PERS'); tokAt = Date.now(); console.log('tokens ok') }
const ensureTokens = async () => { if (!salTok || Date.now() - tokAt > 25 * 60 * 1000) await refresh() }

const SYS = { role: 'system', content: 'Ты — Аня, добрый и тёплый репетитор по окружающему миру для детей 9–10 лет. Ты уже поздоровалась и спросила имя. Веди живой диалог: отвечай коротко (1–2 предложения), по-доброму, простыми словами, задавай встречные вопросы, как настоящий учитель.' }
const GREETING = 'Привет! Меня зовут Аня. А тебя как зовут?'
let history = []

// --- sentence segmentation: pull complete sentences off the front, keep the trailing fragment ---
// A boundary = .!?… (one or more) + optional closing quote/paren, FOLLOWED by whitespace (so we only
// emit a sentence once we know it's finished). The final fragment is flushed at stream end.
const SENT_RE = /^([\s\S]*?[.!?…]+["»”')\]]*)\s+([\s\S]*)$/
function extractSentences(buf) {
  const out = []
  let rest = buf
  let m
  while ((m = rest.match(SENT_RE))) {
    const s = m[1].trim()
    rest = m[2]
    if (s) out.push(s)
  }
  return { sentences: out, rest }
}

// --- STT: REST whole-utterance (unchanged behavior, now via node https) ---
async function stt(pcmBuf) {
  const r = await req('https://smartspeech.sber.ru/rest/v1/speech:recognize', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + salTok, 'Content-Type': 'audio/x-pcm;bit=16;rate=16000' },
    body: pcmBuf,
  })
  try { const j = JSON.parse(r.body.toString()); return (j.result && j.result[0]) || '' } catch { return '' }
}

// --- TTS one sentence → base64 wav ---
async function ttsB64(text) {
  const s = Date.now()
  const r = await req('https://smartspeech.sber.ru/rest/v1/text:synthesize?format=wav16&voice=' + VOICE, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + salTok, 'Content-Type': 'application/text' },
    body: Buffer.from(text, 'utf8'),
  })
  if (r.status !== 200 || r.body.length < 1000) throw new Error('TTS HTTP ' + r.status + ' (' + r.body.length + 'B)')
  return { b64: r.body.toString('base64'), ms: Date.now() - s }
}

// --- GigaChat stream:true (SSE). onFirstToken(ms), onSentence(text) fire live as tokens arrive. ---
function gigachatStream(messages, onFirstToken, onSentence) {
  return new Promise((resolve, reject) => {
    const u = new URL('https://gigachat.devices.sberbank.ru/api/v1/chat/completions')
    const body = JSON.stringify({ model: 'GigaChat', stream: true, messages })
    const t0 = Date.now()
    let firstTokenMs = null, sseBuf = '', pend = '', full = ''
    const r = https.request({
      hostname: u.hostname, port: u.port || 443, path: u.pathname, method: 'POST',
      headers: { 'Authorization': 'Bearer ' + gigTok, 'Content-Type': 'application/json', 'Accept': 'text/event-stream' }, agent,
    }, (res) => {
      if (res.statusCode !== 200) {
        const cs = []; res.on('data', (c) => cs.push(c))
        res.on('end', () => reject(new Error('GigaChat HTTP ' + res.statusCode + ': ' + Buffer.concat(cs).toString().slice(0, 200))))
        return
      }
      res.on('data', (c) => {
        sseBuf += c.toString('utf8')
        let nl
        while ((nl = sseBuf.indexOf('\n')) >= 0) {
          const line = sseBuf.slice(0, nl); sseBuf = sseBuf.slice(nl + 1)
          const m = line.match(/^data:\s*(.*)$/); if (!m || m[1] === '[DONE]') continue
          try {
            const d = JSON.parse(m[1]).choices?.[0]?.delta?.content
            if (d) {
              if (firstTokenMs == null) { firstTokenMs = Date.now() - t0; onFirstToken(firstTokenMs) }
              full += d; pend += d
              const { sentences, rest } = extractSentences(pend); pend = rest
              for (const s of sentences) onSentence(s)
            }
          } catch {}
        }
      })
      res.on('end', () => { const last = pend.trim(); if (last) onSentence(last); resolve({ full, firstTokenMs }) })
      res.on('error', reject)
    })
    r.on('error', reject)
    r.setTimeout(45000, () => r.destroy(new Error('LLM timeout')))
    r.write(body); r.end()
  })
}

// --- greeting (single sentence, plain JSON) ---
async function greetPayload() {
  await ensureTokens()
  history = [{ role: 'assistant', content: GREETING }]
  const { b64 } = await ttsB64(GREETING)
  return { reply: GREETING, audio: b64 }
}

// --- one streamed turn: STT → GigaChat SSE → per-sentence TTS, emitting NDJSON events as they're ready ---
async function turn(pcmBuf, emit) {
  await ensureTokens()
  const tReq = Date.now()

  // 1) STT (blocking whole-utterance)
  const s0 = Date.now()
  let transcript = ''
  try { transcript = await stt(pcmBuf) } catch (e) { emit({ type: 'stt_error', error: String(e?.message || e) }) }
  const sttMs = Date.now() - s0
  emit({ type: 'stt', transcript, ms: sttMs })
  history.push({ role: 'user', content: transcript || '(не расслышала)' })
  if (history.length > 12) history = history.slice(-12)

  // 2) sequential TTS worker — drains a sentence queue IN ORDER, overlapping with ongoing LLM streaming.
  let queue = [], wake = null, ended = false, seq = 0, firstAudioMs = null
  const push = (s) => { const t = String(s || '').trim(); if (!t) return; queue.push(t); if (wake) { const w = wake; wake = null; w() } }
  const worker = (async () => {
    for (;;) {
      while (queue.length === 0 && !ended) await new Promise((r) => { wake = r })
      if (queue.length === 0 && ended) break
      const text = queue.shift()
      try {
        const { b64, ms } = await ttsB64(text)
        if (firstAudioMs == null) firstAudioMs = Date.now() - tReq
        emit({ type: 'audio', seq: seq++, text, ms, b64 })
      } catch (e) { emit({ type: 'audio_error', text, error: String(e?.message || e) }) }
    }
  })()

  // 3) LLM stream → sentences feed the worker as they complete
  const l0 = Date.now()
  let llmFirst = null, full = ''
  try {
    const r = await gigachatStream([SYS, ...history], (ms) => { llmFirst = ms; emit({ type: 'llm_first', ms }) }, push)
    full = r.full || ''
  } catch (e) { emit({ type: 'llm_error', error: String(e?.message || e) }) }
  const llmMs = Date.now() - l0

  let spoken = full.trim()
  if (!spoken) { spoken = 'Прости, я тебя не расслышала. Повтори, пожалуйста.'; push(spoken) }
  history.push({ role: 'assistant', content: spoken })
  if (history.length > 12) history = history.slice(-12)

  // 4) close the worker, wait for the last sentence to synth, then report timings
  ended = true; if (wake) { const w = wake; wake = null; w() }
  await worker
  emit({ type: 'done', t: { stt: sttMs, llmFirst, llm: llmMs, firstAudio: firstAudioMs, total: Date.now() - tReq } })
}

const HTML = `<!doctype html><html lang=ru><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>Аня — живой тест СТРИМИНГ (Klassio / Сбер)</title>
<style>
body{font:16px/1.55 system-ui;max-width:680px;margin:24px auto;padding:0 16px;color:#1d1d1f}
h2{margin:0 0 2px}.sub{color:#888;font-size:13px;margin-bottom:14px}
#go{width:100%;padding:22px;font-size:21px;font-weight:700;border:0;border-radius:16px;background:#2d6cdf;color:#fff;cursor:pointer}
#panel{display:none}
#metric{display:none;background:#fff7e6;border:1px solid #ffd591;color:#ad6800;font-weight:700;border-radius:10px;padding:9px 13px;margin:0 0 10px}
#err{display:none;background:#fff1f0;border:1px solid #ffa39e;color:#a8071a;border-radius:10px;padding:10px 13px;margin:10px 0;white-space:pre-wrap;font-size:13px}
#status{font-size:18px;font-weight:600;margin:6px 0 4px;min-height:26px}
.meter{height:8px;background:#eee;border-radius:6px;overflow:hidden;margin-bottom:14px}
.meter>i{display:block;height:100%;width:0;background:#37b24d;transition:width .06s}
.msg{border:1px solid #e6e6e6;border-radius:12px;padding:10px 14px;margin:9px 0}
.you{color:#444}.anya{background:#f5f8ff}.lbl{font-size:12px;color:#9a9a9a;margin-bottom:3px}.body{white-space:pre-wrap}
.t{font-size:12px;color:#b06000;margin-top:6px}#end{margin-top:14px;background:#eee;border:0;border-radius:10px;padding:8px 14px;cursor:pointer}
</style>
<h2>Аня — живой тест (Сбер-стек, СТРИМИНГ)</h2>
<div class=sub>SaluteSpeech STT → GigaChat (stream) → SaluteSpeech TTS по-предложениям (Nec). Аня начинает говорить, пока ещё думает. Просто говори — она сама поймёт, когда ты договорил.</div>
<div id=err></div>
<button id=go>▶ Начать — Аня поздоровается</button>
<div id=panel>
  <div id=metric></div>
  <div id=status>…</div>
  <div class=meter><i id=lvl></i></div>
  <div id=log></div>
  <button id=end>⏹ Завершить</button>
</div>
<script>
const go=document.getElementById('go'),panel=document.getElementById('panel'),statusEl=document.getElementById('status'),
  metric=document.getElementById('metric'),lvl=document.getElementById('lvl'),log=document.getElementById('log'),errBox=document.getElementById('err');
let ctx,stream,proc,rate=48000,state='idle',recBuf=[],speechMs=0,silMs=0;
// SIL = тишина в конце реплики, мс. 900 безопасно · 700 баланс (сейчас) · 500 агрессивно (риск перебить ребёнка).
const TH=0.015,SIL=700,MINSP=250,MAX=15000;
// audio queue (per-sentence chunks play in order; first plays while later sentences still synthesize)
let audioQueue=[],playing=false,streamDone=false,turnT0=0,firstSoundAt=null;
function setStatus(t){statusEl.textContent=t;}
function esc(s){return String(s==null?'':s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));}
function addMsg(cls,lbl,html){const d=document.createElement('div');d.className='msg '+cls;d.innerHTML='<div class=lbl>'+lbl+'</div><div class=body>'+(html||'')+'</div>';log.prepend(d);return d;}
function rms(b){let s=0;for(let i=0;i<b.length;i++)s+=b[i]*b[i];return Math.sqrt(s/b.length);}
function showError(e){const m=String(e&&e.message?e.message:e);errBox.textContent='⚠ '+m;errBox.style.display='block';console.error('[stand]',e);}
function clearError(){errBox.style.display='none';errBox.textContent='';}
function b64ToBuf(b64){const bin=atob(b64),u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);return u.buffer;}
async function playOnce(b64){if(!b64||!ctx)return;try{const ab=await ctx.decodeAudioData(b64ToBuf(b64));await new Promise(r=>{const s=ctx.createBufferSource();s.buffer=ab;s.connect(ctx.destination);s.onended=r;s.start();});}catch(e){console.warn('playOnce',e);}}
function showMetric(ms){metric.textContent='🔊 VAD → первый звук: '+ms+' мс  (felt — главный замер)';metric.style.display='block';}

// --- ordered playback queue (Web Audio API; ctx unlocked by the start-click → no autoplay block) ---
function enqueue(b64){if(!b64)return;audioQueue.push(b64);if(!playing)pump();}
async function pump(){
  if(audioQueue.length===0){playing=false;maybeEnd();return;}
  playing=true;
  if(state!=='speaking'){state='speaking';setStatus('🔊 Аня говорит…');}
  const b64=audioQueue.shift();
  try{
    const ab=await ctx.decodeAudioData(b64ToBuf(b64));
    const s=ctx.createBufferSource();s.buffer=ab;s.connect(ctx.destination);
    s.onended=()=>pump();s.start();
    if(firstSoundAt==null){firstSoundAt=performance.now();showMetric(Math.round(firstSoundAt-turnT0));}
  }catch(e){console.warn('pump decode',e);pump();return;}
}
function maybeEnd(){if(streamDone&&!playing&&audioQueue.length===0)listen();}

go.onclick=async()=>{
  clearError();go.disabled=true;
  try{
    setStatus('🎤 Запрашиваю доступ к микрофону…');
    await openMic();                              // mic prompt + AudioContext unlock — внутри жеста клика
    go.style.display='none';panel.style.display='block';
    setStatus('🔊 Аня говорит…');state='speaking';
    const resp=await fetch('/greet',{method:'POST'});
    if(!resp.ok)throw new Error('greet HTTP '+resp.status);
    const g=await resp.json();
    if(g.error)throw new Error('greet: '+g.error);
    addMsg('anya','Аня',esc(g.reply));
    await playOnce(g.audio);
    listen();
  }catch(e){
    showError(e);
    go.disabled=false;go.style.display='block';panel.style.display='none';setStatus('…');state='idle';
    if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;}
    if(ctx){try{ctx.close()}catch(_){}ctx=null;}
  }
};
async function openMic(){
  if(ctx)return;
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia)
    throw new Error('Микрофон недоступен в этом контексте. Открой страницу как http://localhost:8123 (не file://).');
  stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true}});
  ctx=new (window.AudioContext||window.webkitAudioContext)();rate=ctx.sampleRate;
  if(ctx.state==='suspended')await ctx.resume();
  const src=ctx.createMediaStreamSource(stream);proc=ctx.createScriptProcessor(4096,1,1);
  proc.onaudioprocess=onAudio;src.connect(proc);proc.connect(ctx.destination);
}
function listen(){state='listening';recBuf=[];speechMs=0;silMs=0;setStatus('🎤 Слушаю — говори');}
function onAudio(e){
  const d=e.inputBuffer.getChannelData(0),energy=rms(d),bufMs=d.length/rate*1000;
  lvl.style.width=Math.min(100,energy*500)+'%';
  if(state!=='listening'&&state!=='recording')return; // no barge-in: mic ignored while Аня speaks/thinks
  if(state==='listening'){
    if(energy>TH){state='recording';recBuf=[new Float32Array(d)];speechMs=bufMs;silMs=0;setStatus('🔴 слушаю тебя…');}
  }else{
    recBuf.push(new Float32Array(d));
    if(energy>TH){speechMs+=bufMs;silMs=0;}else{silMs+=bufMs;}
    const total=recBuf.length*bufMs;
    if((silMs>=SIL&&speechMs>=MINSP)||total>=MAX)finishTurn();
  }
}
async function finishTurn(){
  turnT0=performance.now();                       // ← момент срабатывания VAD (старт замера felt)
  state='processing';setStatus('💭 Думаю…');
  firstSoundAt=null;streamDone=false;audioQueue=[];playing=false;
  let len=recBuf.reduce((a,c)=>a+c.length,0),buf=new Float32Array(len),o=0;
  for(const c of recBuf){buf.set(c,o);o+=c.length;}
  const ratio=rate/16000,n=Math.floor(buf.length/ratio),pcm=new Int16Array(n);
  for(let i=0;i<n;i++){let v=buf[Math.floor(i*ratio)]||0;pcm[i]=Math.max(-32768,Math.min(32767,v*32767));}
  let anyaEl=null,replyText='';
  function onEvent(ev){
    if(ev.type==='stt'){addMsg('you','Ты',esc(ev.transcript)||'<i>(не распознано — говори чуть громче/ближе)</i>');}
    else if(ev.type==='audio'){if(!anyaEl)anyaEl=addMsg('anya','Аня','');replyText+=(replyText?' ':'')+ev.text;anyaEl.querySelector('.body').textContent=replyText;enqueue(ev.b64);}
    else if(ev.type==='llm_error'){if(!anyaEl)anyaEl=addMsg('anya','Аня','');anyaEl.querySelector('.body').innerHTML='<i>LLM error: '+esc(ev.error)+'</i>';}
    else if(ev.type==='done'){
      const felt=firstSoundAt!=null?Math.round(firstSoundAt-turnT0):null,t=ev.t||{};
      const line='STT '+t.stt+'мс · LLM 1-й токен '+(t.llmFirst==null?'—':t.llmFirst)+'мс · 1-й звук(сервер) '+(t.firstAudio==null?'—':t.firstAudio)+'мс · итого '+t.total+'мс'+(felt!=null?' · VAD→звук(felt) '+felt+'мс':'');
      if(anyaEl){const tt=document.createElement('div');tt.className='t';tt.textContent=line;anyaEl.appendChild(tt);}
      streamDone=true;maybeEnd();
    }
  }
  try{
    const resp=await fetch('/turn',{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:pcm.buffer});
    const reader=resp.body.getReader(),dec=new TextDecoder();let s='';
    for(;;){
      const {value,done}=await reader.read();if(done)break;
      s+=dec.decode(value,{stream:true});
      let nl;while((nl=s.indexOf('\\n'))>=0){const line=s.slice(0,nl);s=s.slice(nl+1);if(line.trim())onEvent(JSON.parse(line));}
    }
  }catch(e){showError(e);addMsg('anya','Ошибка',esc(String(e)));streamDone=true;maybeEnd();return;}
}
document.getElementById('end').onclick=()=>{state='ended';if(stream)stream.getTracks().forEach(t=>t.stop());if(ctx)ctx.close();setStatus('Завершено. Обнови страницу, чтобы начать заново.');};
</script></html>`

process.on('uncaughtException', (e) => console.error('uncaught (сервер жив):', e?.message || e))
process.on('unhandledRejection', (e) => console.error('unhandledRejection (сервер жив):', e?.message || e))

await refresh()

http.createServer((req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(HTML); return }
    if (req.method === 'POST' && req.url === '/greet') {
      greetPayload()
        .then((o) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)) })
        .catch((e) => { console.error('greet error:', e); if (!res.headersSent) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: String(e?.message || e) })) } })
      return
    }
    if (req.method === 'POST' && req.url === '/turn') {
      const bufs = []; req.on('data', (c) => bufs.push(c))
      req.on('end', async () => {
        res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-cache' })
        const emit = (o) => { try { res.write(JSON.stringify(o) + '\n') } catch {} }
        try { await turn(Buffer.concat(bufs), emit) } catch (e) { console.error('turn error:', e); emit({ type: 'fatal', error: String(e?.message || e) }) }
        res.end()
      })
      return
    }
    res.writeHead(404); res.end()
  } catch (e) { console.error('handler error:', e); if (!res.headersSent) { res.writeHead(500); res.end() } }
}).listen(PORT, () => console.log(`\n🎙  СТРИМИНГ-стенд. Открой:  http://localhost:${PORT}\n   Нажми «Начать» — Аня поздоровается. Замер felt: «VAD → первый звук».\n`))
