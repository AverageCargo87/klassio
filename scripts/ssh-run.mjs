// scripts/ssh-run.mjs
// One-off SSH command runner for h2.nexus VPS bootstrap.
// Reads connection params from env, runs the command from argv, prints output.
//
// Usage:
//   SSH_HOST=87.120.93.35 SSH_USER=root SSH_PASS=xxx node scripts/ssh-run.mjs 'uname -a'
//
// Why a script and not bash + sshpass: OpenSSH on Windows doesn't ship sshpass,
// and we don't want to install a separate binary. ssh2 npm package handles
// password auth + host-key acceptance + clean stream output.

import { Client } from 'ssh2'

const HOST = process.env.SSH_HOST
const USER = process.env.SSH_USER || 'root'
const PASS = process.env.SSH_PASS
const PORT = Number(process.env.SSH_PORT || 22)
const CMD = process.argv.slice(2).join(' ')

if (!HOST || !PASS || !CMD) {
  console.error('Usage: SSH_HOST=ip SSH_USER=root SSH_PASS=pwd node scripts/ssh-run.mjs <command>')
  process.exit(2)
}

const conn = new Client()
let stdoutBuf = ''
let stderrBuf = ''

conn.on('ready', () => {
  conn.exec(CMD, (err, stream) => {
    if (err) {
      console.error('exec err:', err.message)
      conn.end()
      process.exit(3)
    }
    stream
      .on('close', (code, signal) => {
        process.stdout.write(stdoutBuf)
        if (stderrBuf) {
          process.stderr.write('--- stderr ---\n')
          process.stderr.write(stderrBuf)
        }
        console.log(`\n--- exit ${code}${signal ? ' signal=' + signal : ''} ---`)
        conn.end()
        process.exit(code ?? 0)
      })
      .on('data', (d) => {
        stdoutBuf += d.toString()
      })
      .stderr.on('data', (d) => {
        stderrBuf += d.toString()
      })
  })
})

conn.on('error', (e) => {
  console.error('SSH error:', e.message)
  process.exit(4)
})

conn.connect({
  host: HOST,
  port: PORT,
  username: USER,
  password: PASS,
  // Accept any host key on first connect — we trust the freshly-issued VPS.
  // Real fingerprint pinning is for later, after first hardening pass.
  algorithms: undefined,
  readyTimeout: 30_000,
})
