// scripts/ru-voice-live.mjs (THROWAWAY — live RU-stack voice demo, NOT integrated)
//
// Klassio-like flow: Аня greets FIRST, then auto turn-taking (simple energy VAD:
// you just talk, it detects when you stop). Pipeline: mic → SaluteSpeech STT →
// GigaChat → SaluteSpeech TTS (Nec) → playback. A tiny local node server proxies
// to Sber (holds OAuth, sidesteps browser CORS + Russian-CA cert via curl -k).
// No barge-in (mic ignored while Аня speaks).
//
// Run:  node scripts/ru-voice-live.mjs   → opens http://localhost:8123
import http from 'node:http'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'

const PORT = 8123
const env = readFileSync('.env.local', 'utf8')
const SALUTE_KEY = (env.match(/^SALUTESPEECH_AUTH_KEY=(.*)$/m) || [])[1]?.trim()
const GIGA_KEY = (env.match(/^GIGACHAT_AUTH_KEY=(.*)$/m) || [])[1]?.trim()
if (!SALUTE_KEY || !GIGA_KEY) { console.error('Need SALUTESPEECH_AUTH_KEY and GIGACHAT_AUTH_KEY in .env.local'); process.exit(1) }
mkdirSync('.tmp/live', { recursive: true })

const oauth = (key, scope) => JSON.parse(execFileSync('curl', ['-sk', '-X', 'POST',
  'https://ngw.devices.sberbank.ru:9443/api/v2/oauth', '-H', 'Content-Type: application/x-www-form-urlencoded',
  '-H', 'Accept: application/json', '-H', 'RqUID: ' + randomUUID(), '-H', 'Authorization: Basic ' + key,
  '--data-urlencode', 'scope=' + scope], { encoding: 'utf8' })).access_token
let salTok, gigTok, tokAt = 0
const refresh = () => { salTok = oauth(SALUTE_KEY, 'SALUTE_SPEECH_PERS'); gigTok = oauth(GIGA_KEY, 'GIGACHAT_API_PERS'); tokAt = Date.now(); console.log('tokens ok') }
refresh()

const SYS = { role: 'system', content: 'Ты — Аня, добрый и тёплый репетитор по окружающему миру для детей 9–10 лет. Ты уже поздоровалась и спросила имя. Веди живой диалог: отвечай коротко (1–2 предложения), по-доброму, простыми словами, задавай встречные вопросы, как настоящий учитель.' }
const GREETING = 'Привет! Меня зовут Аня. А тебя как зовут?'
let history = []

const tts = (text) => {
  writeFileSync('.tmp/live/t.txt', text, 'utf8')
  execFileSync('curl', ['-sk', '-o', '.tmp/live/out.wav', '-X', 'POST',
    'https://smartspeech.sber.ru/rest/v1/text:synthesize?format=wav16&voice=Nec_24000',
    '-H', 'Authorization: Bearer ' + salTok, '-H', 'Content-Type: application/text', '--data-binary', '@.tmp/live/t.txt'], { encoding: 'utf8' })
  return readFileSync('.tmp/live/out.wav').toString('base64')
}

function greet() {
  if (Date.now() - tokAt > 25 * 60 * 1000) refresh()
  history = [{ role: 'assistant', content: GREETING }]
  return { reply: GREETING, audio: tts(GREETING) }
}

function turn(pcmBuf) {
  if (Date.now() - tokAt > 25 * 60 * 1000) refresh()
  const t = {}
  writeFileSync('.tmp/live/in.pcm', pcmBuf)
  let s = Date.now()
  const sttRaw = execFileSync('curl', ['-sk', '-X', 'POST', 'https://smartspeech.sber.ru/rest/v1/speech:recognize',
    '-H', 'Authorization: Bearer ' + salTok, '-H', 'Content-Type: audio/x-pcm;bit=16;rate=16000',
    '--data-binary', '@.tmp/live/in.pcm'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  t.stt = Date.now() - s
  let transcript = ''
  try { const j = JSON.parse(sttRaw); transcript = (j.result && j.result[0]) || '' } catch {}

  history.push({ role: 'user', content: transcript || '(не расслышала)' })
  if (history.length > 12) history = history.slice(-12)
  writeFileSync('.tmp/live/llm.json', JSON.stringify({ model: 'GigaChat', messages: [SYS, ...history] }))
  s = Date.now()
  const llmRaw = execFileSync('curl', ['-sk', '-X', 'POST', 'https://gigachat.devices.sberbank.ru/api/v1/chat/completions',
    '-H', 'Authorization: Bearer ' + gigTok, '-H', 'Content-Type: application/json', '-H', 'Accept: application/json',
    '--data', '@.tmp/live/llm.json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  t.llm = Date.now() - s
  let reply = ''
  try { reply = JSON.parse(llmRaw).choices[0].message.content } catch {}
  history.push({ role: 'assistant', content: reply })

  s = Date.now()
  const audio = tts(reply || 'Прости, я не расслышала. Повтори, пожалуйста.')
  t.tts = Date.now() - s
  return { transcript, reply, audio, t }
}

const HTML = `<!doctype html><html lang=ru><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>Аня — живой тест (Klassio / Сбер)</title>
<style>
body{font:16px/1.55 system-ui;max-width:680px;margin:24px auto;padding:0 16px;color:#1d1d1f}
h2{margin:0 0 2px}.sub{color:#888;font-size:13px;margin-bottom:18px}
#go{width:100%;padding:22px;font-size:21px;font-weight:700;border:0;border-radius:16px;background:#2d6cdf;color:#fff;cursor:pointer}
#panel{display:none}
#status{font-size:18px;font-weight:600;margin:6px 0 4px;min-height:26px}
.meter{height:8px;background:#eee;border-radius:6px;overflow:hidden;margin-bottom:14px}
.meter>i{display:block;height:100%;width:0;background:#37b24d;transition:width .06s}
.msg{border:1px solid #e6e6e6;border-radius:12px;padding:10px 14px;margin:9px 0}
.you{color:#444}.anya{background:#f5f8ff}.lbl{font-size:12px;color:#9a9a9a;margin-bottom:3px}
.t{font-size:12px;color:#b06000;margin-top:6px}#end{margin-top:14px;background:#eee;border:0;border-radius:10px;padding:8px 14px;cursor:pointer}
</style>
<h2>Аня — живой тест (Сбер-стек)</h2>
<div class=sub>SaluteSpeech STT → GigaChat → SaluteSpeech TTS (Nec). Аня поздоровается первой, дальше просто говори — она сама поймёт, когда ты договорил.</div>
<button id=go>▶ Начать — Аня поздоровается</button>
<div id=panel>
  <div id=status>…</div>
  <div class=meter><i id=lvl></i></div>
  <div id=log></div>
  <button id=end>⏹ Завершить</button>
</div>
<script>
const go=document.getElementById('go'),panel=document.getElementById('panel'),statusEl=document.getElementById('status'),
  lvl=document.getElementById('lvl'),log=document.getElementById('log');
let ctx,stream,proc,rate=48000,state='idle',recBuf=[],speechMs=0,silMs=0;
const TH=0.015,SIL=900,MINSP=250,MAX=15000;
function setStatus(t){statusEl.textContent=t;}
function addMsg(cls,lbl,html){const d=document.createElement('div');d.className='msg '+cls;d.innerHTML='<div class=lbl>'+lbl+'</div>'+html;log.prepend(d);}
function rms(b){let s=0;for(let i=0;i<b.length;i++)s+=b[i]*b[i];return Math.sqrt(s/b.length);}
function playAudio(b64){return new Promise(r=>{if(!b64)return r();const a=new Audio('data:audio/wav;base64,'+b64);a.onended=r;a.onerror=r;a.play().catch(r);});}

go.onclick=async()=>{
  go.style.display='none';panel.style.display='block';
  setStatus('🔊 Аня говорит…');state='speaking';
  const g=await(await fetch('/greet',{method:'POST'})).json();
  addMsg('anya','Аня',g.reply);
  await playAudio(g.audio);
  await openMic();
  listen();
};
async function openMic(){
  if(ctx)return;
  stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true}});
  ctx=new AudioContext();rate=ctx.sampleRate;
  const src=ctx.createMediaStreamSource(stream);proc=ctx.createScriptProcessor(4096,1,1);
  proc.onaudioprocess=onAudio;src.connect(proc);proc.connect(ctx.destination);
}
function listen(){state='listening';recBuf=[];speechMs=0;silMs=0;setStatus('🎤 Слушаю — говори');}
function onAudio(e){
  const d=e.inputBuffer.getChannelData(0),energy=rms(d),bufMs=d.length/rate*1000;
  lvl.style.width=Math.min(100,energy*500)+'%';
  if(state!=='listening'&&state!=='recording')return;
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
  state='processing';setStatus('💭 Думаю…');
  let len=recBuf.reduce((a,c)=>a+c.length,0),buf=new Float32Array(len),o=0;
  for(const c of recBuf){buf.set(c,o);o+=c.length;}
  const ratio=rate/16000,n=Math.floor(buf.length/ratio),pcm=new Int16Array(n);
  for(let i=0;i<n;i++){let v=buf[Math.floor(i*ratio)]||0;pcm[i]=Math.max(-32768,Math.min(32767,v*32767));}
  const t0=performance.now();
  try{
    const d=await(await fetch('/turn',{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:pcm.buffer})).json();
    const rt=Math.round(performance.now()-t0);
    addMsg('you','Ты',d.transcript||'<i>(не распознано — говори чуть громче/ближе)</i>');
    addMsg('anya','Аня',(d.reply||'<i>(пусто)</i>')+'<div class=t>STT '+d.t.stt+'мс · LLM '+d.t.llm+'мс · TTS '+d.t.tts+'мс · итого с сетью '+rt+'мс</div>');
    setStatus('🔊 Аня говорит…');state='speaking';
    await playAudio(d.audio);
  }catch(e){addMsg('anya','Ошибка',String(e));}
  listen();
}
document.getElementById('end').onclick=()=>{state='ended';if(stream)stream.getTracks().forEach(t=>t.stop());if(ctx)ctx.close();setStatus('Завершено. Обнови страницу, чтобы начать заново.');};
</script></html>`

process.on('uncaughtException', (e) => console.error('uncaught (сервер жив):', e?.message || e))

http.createServer((req, res) => {
  const send = (code, obj) => { if (!res.headersSent) { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)) } }
  try {
    if (req.method === 'GET' && req.url === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(HTML); return }
    if (req.method === 'POST' && req.url === '/greet') {
      let out; try { out = greet() } catch (e) { console.error('greet error:', e); return send(500, { error: String(e) }) }
      return send(200, out)
    }
    if (req.method === 'POST' && req.url === '/turn') {
      const bufs = []; req.on('data', (c) => bufs.push(c))
      req.on('end', () => { let out; try { out = turn(Buffer.concat(bufs)) } catch (e) { console.error('turn error:', e); return send(500, { error: String(e) }) } send(200, out) })
      return
    }
    res.writeHead(404); res.end()
  } catch (e) { console.error('handler error:', e); if (!res.headersSent) { res.writeHead(500); res.end() } }
}).listen(PORT, () => console.log(`\n🎙  Открой:  http://localhost:${PORT}\n   Нажми «Начать» — Аня поздоровается.\n`))
