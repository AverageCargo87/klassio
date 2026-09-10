#!/usr/bin/env node
/**
 * ГАЛЕРЕЯ ЛИЦ ANAM — крупно, локально, без единой платной сессии.
 *
 * Зачем: выбирать лицо в шестерёнке урока неудобно (плитки мелкие), а подключать
 * каждое живьём — значит жечь минуты тарифа. Здесь всё бесплатно: список лиц и
 * превью отдаются обычным GET, сессия не поднимается.
 *
 * 🔑 Главное, на что смотреть, — РОЛИК ПРОСТОЯ, а не фотография. Именно в паузах
 * умер bitHuman: рот шевелился, а лицо стояло. У каждого лица Anam есть 30 секунд
 * молчания — по ним и видно, живой человек или маска.
 *
 * Запуск:  node scripts/anam-galereya.mjs
 *          node scripts/anam-galereya.mjs --all      (не только женские)
 */
import fs from 'node:fs'
import path from 'node:path'

const КОРЕНЬ = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..')
const ВСЕ = process.argv.includes('--all')
const ВЫХОД = path.join(КОРЕНЬ, '.tmp/anam-galereya')

function ключ() {
  try {
    for (const s of fs.readFileSync(path.join(КОРЕНЬ, '.env.local'), 'utf8').split(/\r?\n/)) {
      const m = s.match(/^\s*ANAM_API_KEY=(.*)$/); if (m) return m[1].trim()
    }
  } catch {}
  return process.env.ANAM_API_KEY || ''
}

const KEY = ключ()
if (!KEY) { console.error('нет ANAM_API_KEY в .env.local'); process.exit(1) }

// Список тянем ЗАНОВО: ссылки на ролики подписанные и живут около часа,
// вчерашние отдают 403. Превью-картинки, наоборот, лежат на публичном адресе.
console.log('запрашиваю список лиц…')
const лица = []
for (let page = 1; page <= 10; page++) {
  const r = await fetch(`https://api.anam.ai/v1/avatars?perPage=100&page=${page}`, {
    headers: { Authorization: `Bearer ${KEY}` },
  })
  if (!r.ok) { console.error(`${r.status} ${(await r.text()).slice(0, 200)}`); process.exit(1) }
  const j = await r.json()
  лица.push(...(j.data || []))
  if (!j.meta?.next || page >= (j.meta?.lastPage || 1)) break
}
console.log(`всего лиц: ${лица.length}`)

const пол = (a) => {
  const t = (a.displayTags || []).join(' ').toLowerCase()
  return /\bwoman|female\b/.test(t) ? 'ж' : /\bman|male\b/.test(t) ? 'м' : '?'
}
const отбор = лица
  .filter((a) => ВСЕ || (пол(a) === 'ж' && a.renderStyle === 'realistic'))
  .map((a) => ({
    id: a.id, имя: a.displayName, вариант: a.variantName || '',
    стиль: a.renderStyle, пол: пол(a),
    теги: (a.displayTags || []).map((t) => String(t).toLowerCase()),
    версии: a.availableVersions || [],
    картинка: a.imageUrl || a.landscapeImageUrl || '',
    портрет: a.portraitImageUrl || '',
    ролик: a.videoUrl || a.idleVideoUrl || '',
  }))
console.log(`показываем: ${отбор.length}${ВСЕ ? '' : ' (женские + фотореализм)'}`)

fs.mkdirSync(path.join(ВЫХОД, 'idle'), { recursive: true })

// Ролики качаем к себе: подписанные ссылки протухнут через час, а галерея должна
// открываться и завтра.
let скачано = 0, мимо = 0
for (const [i, a] of отбор.entries()) {
  if (!a.ролик) { мимо++; continue }
  const файл = path.join(ВЫХОД, 'idle', `${a.id}.mp4`)
  a.локальный = `idle/${a.id}.mp4`
  if (fs.existsSync(файл) && fs.statSync(файл).size > 10000) { скачано++; continue }
  try {
    const r = await fetch(a.ролик)
    if (!r.ok) { мимо++; a.локальный = ''; continue }
    fs.writeFileSync(файл, Buffer.from(await r.arrayBuffer()))
    скачано++
    process.stdout.write(`\r  роликов: ${скачано}/${отбор.length}`)
  } catch { мимо++; a.локальный = '' }
}
console.log(`\nролики: скачано ${скачано}, без ролика ${мимо}`)

const карточка = (a) => `
  <figure class=f data-id="${a.id}" data-теги="${a.теги.join(' ')}">
    <div class=media>
      <img src="${a.картинка}" alt="${a.имя}" loading=lazy>
      ${a.локальный ? `<video src="${a.локальный}" muted loop playsinline preload=none></video>` : ''}
      ${a.локальный ? '<span class=подсказка>наведи — как молчит</span>' : '<span class=подсказка>ролика нет</span>'}
    </div>
    <figcaption>
      <b>${a.имя}</b>${a.вариант ? `<i>${a.вариант}</i>` : ''}
      <span class=v>${a.версии.includes('cara-4') ? 'cara-4' : a.версии[0] || ''}</span>
    </figcaption>
    <div class=теги>${a.теги.slice(0, 5).join(' · ')}</div>
    <button class=выбор data-id="${a.id}" data-имя="${a.имя}${a.вариант ? ' · ' + a.вариант : ''}">☆ взять</button>
  </figure>`

const html = `<!doctype html><meta charset=utf-8><title>Лица Anam — крупно</title>
<style>
:root{--bg:#15181E;--card:#1E222B;--line:#2C3240;--ink:#E7EBF2;--dim:#96A0B0;--ok:#8FD08A}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 "Segoe UI",system-ui,sans-serif;padding:24px}
h1{font-size:22px;margin:0 0 4px}
.sub{color:var(--dim);font-size:13.5px;max-width:78ch;margin-bottom:16px}
.sub b{color:var(--ink)}
.bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:16px}
.bar input{background:var(--card);color:var(--ink);border:1px solid var(--line);border-radius:8px;
  padding:6px 11px;font-size:13px;min-width:220px}
.bar span{color:var(--dim);font-size:13px}
.grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fill,minmax(240px,1fr))}
.f{margin:0;background:var(--card);border:1px solid var(--line);border-radius:14px;overflow:hidden;
  display:flex;flex-direction:column}
.f.взят{border-color:var(--ok);box-shadow:0 0 0 2px var(--ok) inset}
.media{position:relative;aspect-ratio:3/4;background:#0F1116;overflow:hidden}
.media img,.media video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;
  object-position:50% 12%;display:block}
.media video{opacity:0;transition:opacity .18s}
.f:hover .media video{opacity:1}
.подсказка{position:absolute;left:8px;bottom:8px;background:rgba(12,14,18,.78);border-radius:7px;
  padding:3px 8px;font-size:11px;color:#CFD8E3}
.f:hover .подсказка{opacity:0}
figcaption{display:flex;align-items:baseline;gap:7px;padding:10px 12px 2px}
figcaption b{font-size:16px}
figcaption i{font-style:normal;color:var(--dim);font-size:12.5px}
figcaption .v{margin-left:auto;font-size:10.5px;color:var(--dim)}
.теги{padding:0 12px 8px;font-size:11.5px;color:var(--dim);min-height:30px}
.выбор{margin:0 12px 12px;background:transparent;color:var(--dim);border:1px solid var(--line);
  border-radius:8px;padding:5px 0;font-size:12.5px;cursor:pointer}
.f.взят .выбор{color:var(--ok);border-color:var(--ok)}
#итог{position:sticky;bottom:0;margin-top:20px;padding:13px 15px;background:var(--card);
  border:1px solid var(--line);border-radius:12px;font-size:14px}
#итог b{color:var(--ok)}
code{background:#0F1116;padding:1px 6px;border-radius:5px;font-size:12px;color:var(--dim)}
</style>
<h1>Лица Anam — крупно</h1>
<div class=sub>${отбор.length} лиц${ВСЕ ? '' : ', только женские и фотореалистичные'}.
<b>Наводите мышь — фотография сменится 30 секундами молчания.</b> Смотреть надо именно на это:
в паузах умер bitHuman — рот шевелился, а лицо стояло. Ни одной платной сессии здесь не тратится.</div>
<div class=bar>
  <input id=поиск placeholder="фильтр по тегам: blazer, curly, mature…">
  <span id=счёт></span>
</div>
<div class=grid id=grid>${отбор.map(карточка).join('')}</div>
<div id=итог>взято: <b id=скок>0</b> <span id=спис></span></div>
<script>
const К='anam_faces_pick'
let взятые=(()=>{try{return JSON.parse(localStorage[К]||'[]')}catch(e){return[]}})()
function перерисуй(){
  for(const el of document.querySelectorAll('.f'))
    el.classList.toggle('взят',взятые.some(x=>x.id===el.dataset.id))
  document.getElementById('скок').textContent=взятые.length
  document.getElementById('спис').textContent=взятые.length?('— '+взятые.map(x=>x.имя).join(', ')):''
}
document.getElementById('grid').onclick=e=>{
  const b=e.target.closest('.выбор'); if(!b)return
  const id=b.dataset.id, имя=b.dataset.имя
  взятые=взятые.some(x=>x.id===id)?взятые.filter(x=>x.id!==id):[...взятые,{id,имя}]
  localStorage[К]=JSON.stringify(взятые); перерисуй()
}
// Ролик крутится только под курсором: 44 видео разом положат любую машину.
for(const f of document.querySelectorAll('.f')){
  const v=f.querySelector('video'); if(!v)continue
  f.addEventListener('mouseenter',()=>{ v.play().catch(()=>{}) })
  f.addEventListener('mouseleave',()=>{ v.pause(); v.currentTime=0 })
}
const поиск=document.getElementById('поиск'), счёт=document.getElementById('счёт')
poisk()
function poisk(){
  const q=поиск.value.trim().toLowerCase()
  let n=0
  for(const f of document.querySelectorAll('.f')){
    const подходит=!q||f.dataset.теги.includes(q)||f.querySelector('b').textContent.toLowerCase().includes(q)
    f.style.display=подходит?'':'none'; if(подходит)n++
  }
  счёт.textContent='показано '+n
}
поиск.oninput=poisk
перерисуй()
</script>`
fs.writeFileSync(path.join(ВЫХОД, 'index.html'), html, 'utf8')
console.log(`\nстраница: ${path.join(ВЫХОД, 'index.html')}`)
