// Мок «раннера» bitHuman отдельным процессом — БЕЗ реального SDK, ключа и .imx.
// Нужен, когда стенд смотрит на раннер по адресу вроде http://localhost:8090, то есть
// ведёт себя ровно как с боевым scripts/bithuman-runner.py.
//
// Сам движок (кадры, выбор лица, «говорит/молчит») живёт в scripts/bhmock-core.mjs —
// оттуда же его берёт стенд yandex-test-server.mjs на /api/bhmock/*, чтобы заглушка
// была под рукой вообще без запуска процессов. Здесь остался только HTTP-каркас.
//
//   GET  /health?avatar=id → { ok, mock:true, avatar, avatars }
//   GET  /avatars          → список лиц
//   GET  /stream?avatar=id → MJPEG
//   POST /push {b64,last}  → PCM16, на время звука двигается рот
//
// Запуск:  node scripts/bithuman-mock.mjs   (порт MOCK_PORT, деф. 8090)
// Кадры рисует scripts/make-bhmock-faces.mjs.
import http from 'node:http'
import { handleMock, faces, CORS } from './bhmock-core.mjs'

const PORT = process.env.MOCK_PORT || 8090

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x')
  const sub = u.pathname.replace(/^\/+/, '')
  if (handleMock(req, res, sub, u.searchParams)) return
  res.writeHead(404, CORS); res.end('bithuman-mock: not found')
})

server.listen(PORT, () => console.log(
  `🎭 bitHuman MOCK: http://localhost:${PORT}  (/health /avatars /stream /push) · лиц: ${faces().map((f) => f.id).join(', ')}`))
