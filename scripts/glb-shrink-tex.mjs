#!/usr/bin/env node
// Ужимает встроенные текстуры GLB до заданного максимума и пересобирает файл.
//
// Зачем: модели с диска (деревья, руины) приходят с атласами 2048² — три дерева
// съедают 64 МБ видеопамяти на сцену, где они стоят декорацией на шести метрах.
// 512² там неотличимы, а память падает в 16 раз.
//
//   node scripts/glb-shrink-tex.mjs вход.glb выход.glb [макс_px=512] [качество=82]
//
// Заодно печатает, что было и что стало, — чтобы решение было видно в логе.

import fs from 'node:fs'
import sharp from 'sharp'

const [, , src, dst, maxArg, qArg] = process.argv
if (!src || !dst) { console.error('usage: glb-shrink-tex.mjs in.glb out.glb [maxPx] [quality]'); process.exit(1) }
const MAX = +(maxArg || 512)
const Q = +(qArg || 82)

const buf = fs.readFileSync(src)
if (buf.readUInt32LE(0) !== 0x46546c67) { console.error('не GLB:', src); process.exit(1) }

const jsonLen = buf.readUInt32LE(12)
const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'))
const binOff = 20 + jsonLen
const binLen = buf.readUInt32LE(binOff)
const bin = buf.slice(binOff + 8, binOff + 8 + binLen)

const images = json.images || []
if (!images.length) { console.log('текстур внутри нет, копирую как есть'); fs.copyFileSync(src, dst); process.exit(0) }

// вытаскиваем каждую картинку из своего bufferView
const views = json.bufferViews || []
const pieces = []          // { start, end } исходных кусков bin, которые уходят под замену
const replaced = []

for (let i = 0; i < images.length; i++) {
  const img = images[i]
  if (img.bufferView === undefined) { replaced.push(null); continue }
  const v = views[img.bufferView]
  const off = v.byteOffset || 0
  const raw = bin.slice(off, off + v.byteLength)
  const meta = await sharp(raw).metadata()
  if (Math.max(meta.width, meta.height) <= MAX) {
    console.log(`  #${i} ${meta.width}×${meta.height} ${meta.format} — уже мелкая, не трогаю`)
    replaced.push(null); continue
  }
  const out = await sharp(raw)
    .resize({ width: Math.min(meta.width, MAX), height: Math.min(meta.height, MAX), fit: 'inside' })
    .jpeg({ quality: Q, chromaSubsampling: '4:4:4' })
    .toBuffer()
  console.log(`  #${i} ${meta.width}×${meta.height} ${meta.format} ${(raw.length / 1024 | 0)}KB → ${MAX}px jpeg ${(out.length / 1024 | 0)}KB`)
  replaced.push(out)
  pieces.push({ view: img.bufferView, off, len: v.byteLength })
}

if (!replaced.some(Boolean)) { console.log('нечего ужимать'); fs.copyFileSync(src, dst); process.exit(0) }

// пересобираем бинарный чанк: сначала всё, что НЕ картинки, потом новые картинки подряд.
// Проще и надёжнее, чем править смещения на месте: пересчитываем byteOffset у всех вью.
const imgViews = new Set(pieces.map(p => p.view))
const parts = []
let cursor = 0
const newViews = views.map((v, idx) => {
  if (imgViews.has(idx)) return { ...v }         // разложим ниже
  const off = v.byteOffset || 0
  const slice = bin.slice(off, off + v.byteLength)
  const pad = (4 - (cursor % 4)) % 4
  if (pad) { parts.push(Buffer.alloc(pad)); cursor += pad }
  parts.push(slice)
  const nv = { ...v, byteOffset: cursor, byteLength: v.byteLength }
  cursor += v.byteLength
  return nv
})
for (let i = 0; i < images.length; i++) {
  const data = replaced[i]
  if (!data) continue
  const idx = images[i].bufferView
  const pad = (4 - (cursor % 4)) % 4
  if (pad) { parts.push(Buffer.alloc(pad)); cursor += pad }
  parts.push(data)
  newViews[idx] = { ...newViews[idx], byteOffset: cursor, byteLength: data.length }
  cursor += data.length
  images[i].mimeType = 'image/jpeg'
}
const newBin = Buffer.concat(parts)
json.bufferViews = newViews
json.buffers = [{ byteLength: newBin.length }]

let jsonOut = Buffer.from(JSON.stringify(json), 'utf8')
while (jsonOut.length % 4) jsonOut = Buffer.concat([jsonOut, Buffer.from(' ')])
let binOut = newBin
while (binOut.length % 4) binOut = Buffer.concat([binOut, Buffer.alloc(1)])

const head = Buffer.alloc(12)
head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4)
head.writeUInt32LE(12 + 8 + jsonOut.length + 8 + binOut.length, 8)
const jh = Buffer.alloc(8); jh.writeUInt32LE(jsonOut.length, 0); jh.writeUInt32LE(0x4e4f534a, 4)
const bh = Buffer.alloc(8); bh.writeUInt32LE(binOut.length, 0); bh.writeUInt32LE(0x004e4942, 4)
fs.writeFileSync(dst, Buffer.concat([head, jh, jsonOut, bh, binOut]))

const a = fs.statSync(src).size, b = fs.statSync(dst).size
console.log(`${src} ${(a / 1048576).toFixed(2)}MB → ${dst} ${(b / 1048576).toFixed(2)}MB`)
