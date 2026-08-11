#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Собирает HD-вариант сцен урока §20 из low-poly оригинала.

    python scripts/make-krit-hd.py

Вход  : .tmp/sketches/tutor/krit-scenes.html      (low-poly, единственный источник правды)
Выход : .tmp/sketches/tutor/krit-scenes-hd.html   (перезаписывается целиком)

Почему генератор, а не второй файл руками: вся логика урока — 16 шагов, слайды доски,
тетрадь, закон пустого коридора, расталкивание предметов — общая. Правится в одном месте,
в HD переносится автоматически. HD отличается ТОЛЬКО слоем ассетов и освещением.

Если правка нужна только в HD — её место здесь, в таблице SUBS, а не в готовом файле.
"""
import io, os, sys

# консоль Windows по умолчанию cp1251 и давится галочками — переводим вывод в UTF-8
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, '.tmp', 'sketches', 'tutor', 'krit-scenes.html')
DST = os.path.join(ROOT, '.tmp', 'sketches', 'tutor', 'krit-scenes-hd.html')

HD_SWAP = """
// ═══════════════════════════════════════════════════════════════════════════
//  HD-СЛОЙ. Вся геометрия расстановки, закон пустого коридора, расталкивание
//  предметов и весь материал урока унаследованы от low-poly версии без изменений
//  — подменяется только АССЕТ. Слева файл, который просит код сцены,
//  справа — фотограмметрия ему на замену.
//  ⚠️ Файл собран скриптом scripts/make-krit-hd.py. Руками не править:
//     правка уедет при следующей сборке. Источник — krit-scenes.html.
// ═══════════════════════════════════════════════════════════════════════════
const HD_SWAP={
  '/kn-pithos.glb'      :'/hd-pithos.glb',          // настоящий минойский пифос, скан
  '/kn-pithos-b.glb'    :'/hd-myc-jug2.glb',        // микенская стремявидная фляга, инв. 2
  '/kn-pithos-c.glb'    :'/hd-minoan-ewer.glb',
  '/kn-jug.glb'         :'/hd-myc-jug.glb',         // микенский кувшин со змеями, инв. 2723
  '/kn-basket.glb'      :'/hd-basket-wicker.glb',
  '/kn-table.glb'       :'/hd-table-plain.glb',
  '/kn-bench.glb'       :'/hd-bench-planks.glb',
  '/kn-brazier.glb'     :'/hd-hearth-stone.glb',
  '/kn-mortar.glb'      :'/hd-bowl-wood.glb',
  '/kn-olive.glb'       :'/hd-olive-gnarled.glb',
  '/nat-rock-a.glb'     :'/hd-rock-07.glb',
  '/nat-rock-b.glb'     :'/hd-rock-09.glb',
  '/nat-rock-c.glb'     :'/hd-rock-boulder-arid-03.glb',
  '/nat-bush.glb'       :'/hd-shrub-spiny.glb',
  '/nat-dead-1.glb'     :'/hd-dead-trunk.glb',
  '/nat-fern.glb'       :'/hd-shrub-twiggy.glb',
  '/mk-block-f.glb'     :'/hd-rock-boulder-arid-06.glb',
  '/mk-rubble.glb'      :'/hd-stone-rubble-scatter.glb',
  // ⚠️ Галька, гравий и трава НАМЕРЕННО остались low-poly: их фотосканы весят
  // 70–100 тыс. треугольников на предмет размером с ладонь. Сцена тяжелела вдвое,
  // а глазом разницы нет — под ноги никто не смотрит.
}
// Сканы весят 60–150 тыс. треугольников штука, поэтому мелочи кладём вдвое меньше.
const HD_N=.5
"""

PBR = """
// ═══════════════════════════════════════════════════════════════════════════
//  PBR-МАТЕРИАЛЫ. Процедурная архитектура (колонны, стены, ворота, очаг)
//  остаётся процедурной, но одевается в настоящие карты: albedo + normal + ARM
//  (ambient occlusion в R, roughness в G, metalness в B — раскладка ambientCG).
//  ⚠️ aoMap НЕ подключаем: в three r160 он читает UV-канал uv1, которого у
//  примитивов нет, и без ручного дублирования UV карта ломает освещение.
// ═══════════════════════════════════════════════════════════════════════════
const _texL=new THREE.TextureLoader()
function pbrMat(slug,{tile=1,color=0xffffff,rough=1,nScale=1}={}){
  const m=new THREE.MeshStandardMaterial({ color, roughness:rough, metalness:0,
    normalScale:new THREE.Vector2(nScale,nScale), envMapIntensity:1.0 })
  const wrap=(t,srgb)=>{ t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(tile,tile)
    t.anisotropy=8; if(srgb) t.colorSpace=THREE.SRGBColorSpace; return t }
  _texL.load('/hd-'+slug+'-albedo.png', t=>{ m.map=wrap(t,true); m.needsUpdate=true }, undefined, ()=>{})
  _texL.load('/hd-'+slug+'-normal.png', t=>{ m.normalMap=wrap(t,false); m.needsUpdate=true }, undefined, ()=>{})
  _texL.load('/hd-'+slug+'-arm.png',    t=>{ const w=wrap(t,false)
    m.roughnessMap=w; m.metalnessMap=w; m.needsUpdate=true }, undefined, ()=>{})
  return m }
"""

IBL = """
// ═══════════════════════════════════════════════════════════════════════════
//  СВЕТ ИЗ ПАНОРАМЫ (IBL). Главный рычаг реализма: камень и глина начинают
//  получать цвет неба сверху и отражённый свет земли снизу, как в жизни.
//  PMREMGenerator свёртывает equirect-панораму в кубическую карту окружения.
// ═══════════════════════════════════════════════════════════════════════════
const pmrem=new THREE.PMREMGenerator(renderer)
pmrem.compileEquirectangularShader()
let envRT=null
function applyEnvFrom(tex){
  try{
    const rt=pmrem.fromEquirectangular(tex)
    if(envRT) envRT.dispose()
    envRT=rt; scene.environment=rt.texture
  }catch(e){ err('IBL не построился: '+e.message) }
}
"""

VER_LINK_HD = """  <div style="display:flex;gap:6px;margin:0 0 8px">
    <a href="/krit2" style="flex:1;padding:6px 4px;background:#2A2632;color:#C9BFB2;border:1px solid #453F50;border-radius:7px;font-size:12px;font-weight:600;text-align:center;text-decoration:none">← low-poly</a>
    <span style="flex:1;padding:6px 4px;background:#8FD08A;color:#1B2418;border-radius:7px;font-size:12px;font-weight:700;text-align:center">HD</span>
  </div>
"""
VER_LINK_LD = """  <div style="display:flex;gap:6px;margin:0 0 8px">
    <span style="flex:1;padding:6px 4px;background:#F2A33C;color:#221E28;border-radius:7px;font-size:12px;font-weight:700;text-align:center">low-poly</span>
    <a href="/krit3" style="flex:1;padding:6px 4px;background:#2A2632;color:#8FD08A;border:1px solid #453F50;border-radius:7px;font-size:12px;font-weight:600;text-align:center;text-decoration:none">HD →</a>
  </div>
"""

# (что заменить, на что) — порядок важен
SUBS = [
    ('<title>НАЧАЛО ГРЕЧЕСКОЙ ЦИВИЛИЗАЦИИ §20 · сцены 2–4 · Кносс, Микены, раскопки</title>',
     '<title>НАЧАЛО ГРЕЧЕСКОЙ ЦИВИЛИЗАЦИИ §20 · HD — фотограмметрия и PBR</title>'),
    ('<h1>§20 · НАЧАЛО ГРЕЧЕСКОЙ ЦИВИЛИЗАЦИИ</h1>', '<h1>§20 · НАЧАЛО ГРЕЧЕСКОЙ ЦИВИЛИЗАЦИИ · <span style="color:#8FD08A">HD</span></h1>'),
    ('<div class=sub>Кносс · Микены · раскопки. КРУГ общий для всех сцен.</div>',
     '<div class=sub>Фотограмметрия музейных предметов + PBR-материалы + свет из панорамы.</div>'),
    ("const LS='klassio-krit-scenes-v1'", "const LS='klassio-krit-scenes-hd'"),
    (VER_LINK_LD, VER_LINK_HD),
    # таблица подмены — перед загрузчиком моделей
    ('const gltfL=new GLTFLoader()', HD_SWAP + '\nconst gltfL=new GLTFLoader()'),
    ('''function loadKit(url,group){
  if(kitCache.has(url)) return kitCache.get(url)''',
     '''function loadKit(url,group){
  url=HD_SWAP[url]||url
  if(kitCache.has(url)) return kitCache.get(url)'''),
    ("g.scene.name=url.replace(/^\\/|\\.glb$/g,''); res(g.scene) },",
     "g.scene.name=url.replace(/^\\/|\\.glb$/g,''); g.scene.userData.hd=url.startsWith('/hd-'); res(g.scene) },"),
    # у фотограмметрии текстуру отбирать нельзя
    ('''  if(tint||noTex||flat){
    const seen=new Set()''',
     '''  // 🔴 Код сцены местами просит noTex+tint — это лечение косяков low-poly атласов.
  // У фотограмметрии текстура и есть весь реализм, поэтому для hd-моделей игнорируем.
  if(src.userData&&src.userData.hd){ tint=null; noTex=false }
  if(tint||noTex||flat){
    const seen=new Set()'''),
    # мелочи вдвое меньше
    ('function scatterRing(src,group,{n,rMin,rMax,', 'function scatterRing(src,group,{n:nRaw,rMin,rMax,'),
    ('  const R=rnd(seed)\n  for(let i=0;i<n;i++){\n    let p=null',
     '  const R=rnd(seed)\n  const n=Math.max(2,Math.round(nRaw*HD_N))\n  for(let i=0;i<n;i++){\n    let p=null'),
    # PBR-блок обязан стоять ВЫШЕ пола: floorMat зовёт pbrMat при инициализации модуля,
    # иначе _texL попадает во временнУю мёртвую зону и страница падает целиком
    ('// ═══════════════════════════════════════════════════════════════════════════\n//  КРУГ — пол-диск',
     PBR + '\n// ═══════════════════════════════════════════════════════════════════════════\n//  КРУГ — пол-диск'),
    (IBL.strip()[:0] or '// ═══════════════════════════════════════════════════════════════════════════\n//  ЗАГРУЗКА МОДЕЛЕЙ + КЕШ ТЕКСТУР',
     IBL + '\n// ═══════════════════════════════════════════════════════════════════════════\n//  ЗАГРУЗКА МОДЕЛЕЙ + КЕШ ТЕКСТУР'),
    ('  if(panoCache.has(slug)){ skyMat.map=panoCache.get(slug); skyMat.color.set(0xffffff); skyMat.needsUpdate=true; return }',
     '''  if(panoCache.has(slug)){ const t=panoCache.get(slug)
    skyMat.map=t; skyMat.color.set(0xffffff); skyMat.needsUpdate=true; applyEnvFrom(t); return }'''),
    ('    if(panoCur===slug){ skyMat.map=t; skyMat.color.set(0xffffff); skyMat.needsUpdate=true }',
     '    if(panoCur===slug){ skyMat.map=t; skyMat.color.set(0xffffff); skyMat.needsUpdate=true; applyEnvFrom(t) }'),
    # пол на настоящем грунте
    ('const floorMat=new THREE.MeshStandardMaterial({ map:groundTex, alphaMap:fadeTex, transparent:true, roughness:1 })',
     """const floorMat=(()=>{ const m=pbrMat('ground',{ tile:9, color:0xEDE7DA, nScale:.7 })
  m.alphaMap=fadeTex; m.transparent=true; return m })()"""),
    # тени и геометрия
    ('key.shadow.mapSize.set(2048,2048)', 'key.shadow.mapSize.set(4096,4096)'),
    ('new THREE.LatheGeometry(pts.map(([r,y])=>new THREE.Vector2(r*k,y*k)),20)',
     'new THREE.LatheGeometry(pts.map(([r,y])=>new THREE.Vector2(r*k,y*k)),48)'),
    ('new THREE.CylinderGeometry(.30*k,.225*k,2.60*k,16)', 'new THREE.CylinderGeometry(.30*k,.225*k,2.60*k,48)'),
    ('new THREE.CylinderGeometry(.42*k,.36*k,.20*k,16)', 'new THREE.CylinderGeometry(.42*k,.36*k,.20*k,48)'),
    ('new THREE.CylinderGeometry(.275*k,.29*k,.12*k,16)', 'new THREE.CylinderGeometry(.275*k,.29*k,.12*k,48)'),
    ('new THREE.IcosahedronGeometry(1,0),MAT.cyclop', 'new THREE.IcosahedronGeometry(1,1),MAT.cyclop'),
]

# материалы: плоский цвет → настоящие карты
MATS = [
    ('gypsum', "new THREE.MeshStandardMaterial({ color:0xDCC9A4, roughness:.92 })", "pbrMat('limestone',{ tile:1.6, color:0xE6D6B4, nScale:1.1 })"),
    ('plaster', "new THREE.MeshStandardMaterial({ color:0xEADCC0, roughness:.94 })", "pbrMat('limestone',{ tile:2.4, color:0xF2E6CC, nScale:.55 })"),
    ('clay', "new THREE.MeshStandardMaterial({ color:0xC08A5B, roughness:.90 })", "pbrMat('terracotta',{ tile:1.2, color:0xD09A6B, nScale:1.0 })"),
    ('wood', "new THREE.MeshStandardMaterial({ color:0x6B4F31, roughness:.90 })", "pbrMat('wood',{ tile:1.4, color:0x9A7A52, nScale:1.0 })"),
    ('beam', "new THREE.MeshStandardMaterial({ color:0x5D4A34, roughness:.90 })", "pbrMat('wood',{ tile:1.0, color:0x7A5F40, nScale:1.2 })"),
    ('cyclop', "new THREE.MeshStandardMaterial({ color:0x8E8272, roughness:.95, flatShading:true })", "pbrMat('roughstone',{ tile:.9, color:0xA0937E, nScale:1.5 })"),
    ('conglom', "new THREE.MeshStandardMaterial({ color:0x7E7061, roughness:.95, flatShading:true })", "pbrMat('roughstone',{ tile:1.3, color:0x8E7F6C, nScale:1.4 })"),
    ('reliefPl', "new THREE.MeshStandardMaterial({ color:0xC9C0AC, roughness:.90 })", "pbrMat('limestone',{ tile:1.1, color:0xD8CFB8, nScale:.9 })"),
    ('ruin', "new THREE.MeshStandardMaterial({ color:0xBCAE8E, roughness:.95, flatShading:true })", "pbrMat('limestone',{ tile:1.4, color:0xC6B896, nScale:1.2 })"),
    ('pave', "new THREE.MeshStandardMaterial({ color:0xA8A08E, roughness:.94, flatShading:true })", "pbrMat('roughstone',{ tile:1.6, color:0xB4AC98, nScale:1.0 })"),
    ('ash', "new THREE.MeshStandardMaterial({ color:0x6E6A62, roughness:.98 })", "pbrMat('ash',{ tile:1.2, color:0x8A857A, nScale:1.0 })"),
    ('terracotta', "new THREE.MeshStandardMaterial({ color:0xCB5A3C, roughness:.88 })", "pbrMat('terracotta',{ tile:.8, color:0xD9603F, nScale:1.1 })"),
]

def main():
    s = io.open(SRC, encoding='utf-8').read()
    miss = []
    for a, b in SUBS:
        if a not in s:
            miss.append(a.strip().splitlines()[0][:70]); continue
        s = s.replace(a, b, 1)
    for name, old, new in MATS:
        key = '  %s:' % name
        i = s.find(key)
        if i < 0 or old not in s:
            miss.append('материал ' + name); continue
        s = s.replace(old, new, 1)
    io.open(DST, 'w', encoding='utf-8').write(s)
    print('HD собран: %s (%d символов)' % (os.path.basename(DST), len(s)))
    for probe, label in [('HD_SWAP', 'таблица подмены'), ('pbrMat(', 'PBR-материалы'),
                         ('applyEnvFrom', 'свет из панорамы'), ('const LESSON=', 'материал урока'),
                         ('function relaxProps', 'расталкивание'), ('CLEAR={', 'закон коридора')]:
        print(('  ✅ ' if probe in s else '  ❌ ') + label)
    if s.index('_texL') > s.index('const floorMat'):
        print('  ❌ ПОРЯДОК: _texL объявлен ПОСЛЕ floorMat — страница упадёт на TDZ')
        return 1
    print('  ✅ порядок объявлений (PBR выше пола)')
    if miss:
        print('\n⚠ не найдено в источнике (%d):' % len(miss))
        for m in miss: print('   ' + m)
        return 1
    return 0

if __name__ == '__main__':
    sys.exit(main())
