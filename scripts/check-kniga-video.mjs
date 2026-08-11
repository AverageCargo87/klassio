#!/usr/bin/env node
// Приёмка видео-учителя в уроке-учебнике (/kniga): поднимается сам при выборе,
// лица выбираются, звук уходит раннеру (по нему двигаются губы), подсветка строки
// работает и на видео-пути. Синтез подменён тишиной — символы Яндекса не жжём.
//   node scripts/check-kniga-video.mjs
// Если на :8090 поднят боевой раннер (START-BITHUMAN.ps1) — проверка идёт через него;
// если нет — через заглушку стенда, и это видно в статусе.
import { chromium } from 'playwright'
import fs from 'node:fs'
const CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe'
function wav(sec){ const rate=16000,n=Math.round(sec*rate),b=Buffer.alloc(44+n*2)
  b.write('RIFF',0);b.writeUInt32LE(36+n*2,4);b.write('WAVE',8);b.write('fmt ',12)
  b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24)
  b.writeUInt32LE(rate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36)
  b.writeUInt32LE(n*2,40);return b }
const pcmB64=Buffer.alloc(16000*2*2).toString('base64')     // 2 с тишины PCM16 16k
const b=await chromium.launch({ executablePath: fs.existsSync(CHROME)?CHROME:undefined,
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required'] })
const page=await b.newPage({ viewport:{width:1600,height:900} })
const errs=[]; const pushes=[]
page.on('pageerror',e=>errs.push(String(e).slice(0,140)))
page.on('console',m=>{ if(m.type()==='error'&&!/favicon|getUserMedia/i.test(m.text())) errs.push(m.text().slice(0,140)) })
// синтез: MP3-путь -> тишина wav, PCM-путь -> b64 тишины
await page.route('**/api/tts', async r=>{
  const body=JSON.parse(r.request().postData()||'{}')
  if(body.pcm) return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({b64:pcmB64})})
  return r.fulfill({status:200,contentType:'audio/wav',body:wav(2)})
})
page.on('request',q=>{ if(/bhmock\/push|bithuman-push/.test(q.url())) pushes.push(q.url()) })
const ok=[],bad=[]; const say=(g,t)=>(g?ok:bad).push(t)

await page.goto('http://localhost:8781/kniga',{waitUntil:'domcontentloaded',timeout:60000})
await page.waitForFunction(()=>window.__kniga&&window.__kniga.beats()>0,null,{timeout:60000})
await page.mouse.click(800,860)
// Источник — «рисованная заглушка» ЯВНО: в боевом режиме («авто») страница при
// отсутствии раннера возвращается к 3D-учительнице и мультяшку не подсовывает.
// Здесь проверяем именно СВЯЗЬ: поток, выбор лиц, уход звука раннеру.
// ⚠️ Через evaluate, а не selectOption: панель настроек по умолчанию свёрнута, и
// playwright не кликнет по невидимому селекту. Источник ставим ДО выбора учителя.
await page.evaluate(()=>{ const s=document.querySelector('#bhSrc'); s.value='mock' })
await page.evaluate(()=>window.__kniga.setTeacher('bh'))
for(let i=0;i<30;i++){ await page.waitForTimeout(500)
  if((await page.evaluate(()=>window.__kniga.video())).вкадре) break }
let v=await page.evaluate(()=>window.__kniga.video())
say(v.вкадре&&v.видно, 'видео в кадре и показано · '+v.статус)
say(v.кадр[0]>0, 'кадр дошёл: '+v.кадр.join('×'))
say(v.лиц.length>=2, 'лиц на выбор: '+v.лиц.length+' ('+v.лиц.join(', ')+')')
const second=v.лиц[1]
await page.evaluate(id=>window.__kniga.setFace(id),second)
for(let i=0;i<20;i++){ await page.waitForTimeout(500)
  const s=await page.evaluate(()=>window.__kniga.video()); if(s.лицо===second&&s.вкадре) break }
v=await page.evaluate(()=>window.__kniga.video())
say(v.лицо===second&&v.вкадре, 'лицо переключилось на «'+second+'» · '+v.статус)
await page.screenshot({ path:'.tmp/shots-kniga/6-video.png' })
// урок: звук обязан уходить раннеру
await page.evaluate(()=>window.__kniga.run())
await page.waitForTimeout(6000)
say(pushes.length>0, 'звук уходит раннеру: пушей '+pushes.length)
const stt=await page.evaluate(()=>window.__kniga.state())
say(stt.идёт, 'урок идёт с видео-учителем: такт '+stt.такт)
const rd=await page.evaluate(()=>window.__kniga.readState())
say(rd.строк>0, 'подсветка строки работает и на видео-пути (строк '+rd.строк+')')
await page.screenshot({ path:'.tmp/shots-kniga/7-video-urok.png' })
await page.evaluate(()=>window.__kniga.stop())
console.log('\n✅ '+ok.join('\n✅ '))
if(bad.length) console.log('\n❌ '+bad.join('\n❌ '))
if(errs.length) console.log('\n⚠ ошибки:\n  '+[...new Set(errs)].slice(0,5).join('\n  '))
console.log(`\nитог: ${ok.length} ок, ${bad.length} мимо, ошибок ${errs.length}`)
await b.close()
process.exit(bad.length||errs.length?1:0)
