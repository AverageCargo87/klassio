#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
//  ПЕРЕЕЗД ВИТРИНЫ НА РЕЛИЗЫ (выполняется ОДИН раз, дальше не нужен)
//
//  Было: выкладка распаковывала архив ПОВЕРХ живой папки. Прошлого состояния не
//  оставалось нигде — то есть откатить было нечего. Стало:
//
//      /opt/klassio-lab/
//        releases/0001-20260811-0430/   ← каждая выкладка = отдельная папка
//        releases/0002-.../
//        shared/       .yandex-secret.json · feedback.jsonl   (переживают всё)
//        current  ->  releases/000N                            (на неё смотрит служба)
//
//  Откат = переставить ссылку current и перезапустить службу: секунда, без выкладки.
//  Замечания руководителя лежат в shared/ и откатом НЕ стираются — иначе смысл теряется.
//
//  node scripts/lab-server-init.mjs
//  Скрипт идемпотентный: если переезд уже был, он это скажет и ничего не тронет.
// ═══════════════════════════════════════════════════════════════════════════
import { assertRoot, sshScript, ROOT, HOST, REMOTE_HEALTH, REMOTE_LINK_SHARED } from './lab-common.mjs'

assertRoot()

const script = `
set -eu
${REMOTE_HEALTH}
${REMOTE_LINK_SHARED}
cd ${ROOT}

if [ -L current ]; then
  echo "Переезд уже был: current -> $(readlink current)"
  echo "Релизы:"; ls -1 releases
  exit 0
fi

command -v curl >/dev/null || { echo "нет curl — проверить живость нечем"; exit 1; }

ID="0001-$(date +%Y%m%d-%H%M)"
echo "== снимаю живое состояние как релиз $ID =="
mkdir -p releases shared "releases/$ID"
# всё, что лежало плоско, уезжает внутрь релиза
find . -maxdepth 1 -mindepth 1 ! -name releases ! -name shared ! -name current -exec mv -t "releases/$ID/" {} +

# ключ Яндекса и замечания — в общее, они не принадлежат версии
if [ -f "releases/$ID/scripts/.yandex-secret.json" ]; then
  mv "releases/$ID/scripts/.yandex-secret.json" shared/
  chmod 600 shared/.yandex-secret.json
fi
touch shared/feedback.jsonl
if [ -f "releases/$ID/.tmp/feedback.jsonl" ]; then
  cat "releases/$ID/.tmp/feedback.jsonl" >> shared/feedback.jsonl
  rm "releases/$ID/.tmp/feedback.jsonl"
fi
link_shared "releases/$ID"

cat > "releases/$ID/RELEASE.json" <<EOF
{
  "id": "$ID",
  "когда": "$(date -Is)",
  "что": "состояние, развёрнутое 10.08.2026 и увиденное руководителем",
  "коммит": "до перехода на git-зеркало",
  "версии": { "ГАММА": "v2.5", "БЕТА": "v2.3", "АЛЬФА": "v1.0" }
}
EOF
# Манифест считается по ВСЕМ файлам релиза (включая картинки): выкладка сверяет с ним
# пакет и печатает, что именно изменится на боевом. Урезанный список врал бы.
( cd "releases/$ID" && find . -type f ! -name MANIFEST.md5 ! -name RELEASE.json \\
    | sed 's#^\\./##' | sort | xargs md5sum > /tmp/man.md5 && mv /tmp/man.md5 MANIFEST.md5 )

ln -sfn "releases/$ID" current
sed -i 's#^WorkingDirectory=.*#WorkingDirectory=${ROOT}/current#' /etc/systemd/system/klassio-lab.service
systemctl daemon-reload
systemctl restart klassio-lab

cat > ${ROOT}/КАК-ОТКАТИТЬ.txt <<'EOF'
Витрина живёт релизами. Служба смотрит на ссылку current.

  ls -l /opt/klassio-lab/current          какой релиз сейчас
  ls -1 /opt/klassio-lab/releases         что можно вернуть
  cat /opt/klassio-lab/releases/*/RELEASE.json | less    что в каждом

Откатить руками (обычно этого не нужно — с рабочей машины делает
node scripts/lab-rollback.mjs --to <номер>):

  ln -sfn /opt/klassio-lab/releases/<ПАПКА> /opt/klassio-lab/current
  systemctl restart klassio-lab

Замечания руководителя и ключ Яндекса лежат в /opt/klassio-lab/shared
и откатом НЕ стираются.
EOF

echo "== проверяю живость =="
health || { echo "ПРОМАХ: после переезда витрина не отвечает"; exit 1; }
echo
echo "current -> $(readlink current)"
du -sh releases shared
`

console.log('── переезд ' + HOST + ':' + ROOT + ' на релизы ──\n')
sshScript(script)
console.log('\n✓ Готово. Дальше выкладка — node scripts/lab-deploy.mjs -m "что и зачем"')
