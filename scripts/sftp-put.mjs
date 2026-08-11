// scripts/sftp-put.mjs
// One-off SFTP file uploader for the h2.nexus VPS (self-host migration).
// ssh-run.mjs only runs commands; this pushes a local file to a remote path.
//
// Usage:
//   SSH_HOST=87.120.93.151 SSH_USER=root SSH_PASS=xxx \
//     node scripts/sftp-put.mjs <localPath> <remotePath>
//
// Why: OpenSSH scp on Windows is flaky with password auth (no sshpass); ssh2's
// SFTP fastPut streams the file with the same password auth we already use.

import { Client } from 'ssh2'
import { statSync } from 'node:fs'

const HOST = process.env.SSH_HOST
const USER = process.env.SSH_USER || 'root'
const PASS = process.env.SSH_PASS
const PORT = Number(process.env.SSH_PORT || 22)
const LOCAL = process.argv[2]
const REMOTE = process.argv[3]

if (!HOST || !PASS || !LOCAL || !REMOTE) {
  console.error('Usage: SSH_HOST=ip SSH_USER=root SSH_PASS=pwd node scripts/sftp-put.mjs <local> <remote>')
  process.exit(2)
}

const size = statSync(LOCAL).size
const conn = new Client()

conn.on('ready', () => {
  conn.sftp((err, sftp) => {
    if (err) {
      console.error('sftp err:', err.message)
      conn.end()
      process.exit(3)
    }
    let last = 0
    sftp.fastPut(
      LOCAL,
      REMOTE,
      {
        step: (transferred) => {
          const pct = Math.floor((transferred / size) * 100)
          if (pct >= last + 10) {
            last = pct
            process.stdout.write(`  ${pct}% (${transferred}/${size} bytes)\n`)
          }
        },
      },
      (putErr) => {
        if (putErr) {
          console.error('fastPut err:', putErr.message)
          conn.end()
          process.exit(4)
        }
        console.log(`OK: uploaded ${LOCAL} -> ${REMOTE} (${size} bytes)`)
        conn.end()
        process.exit(0)
      }
    )
  })
})

conn.on('error', (e) => {
  console.error('SSH error:', e.message)
  process.exit(5)
})

conn.connect({
  host: HOST,
  port: PORT,
  username: USER,
  password: PASS,
  algorithms: undefined,
  readyTimeout: 30_000,
})
