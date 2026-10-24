#!/usr/bin/env node
// Mandatory checks before EVERY push (admin rule, 24/10/2026): if any step fails the push is
// refused. Run by .githooks/pre-push (git config core.hooksPath .githooks) or `npm run verify`.
// Never bypass with `git push --no-verify`.
import { spawnSync, spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { readFileSync, existsSync, readdirSync, mkdtempSync, rmSync, statSync } from 'node:fs'
import { join, extname, resolve } from 'node:path'
import { tmpdir } from 'node:os'

const ROOT = resolve(import.meta.dirname, '..')
const isWin = process.platform === 'win32'
const started = Date.now()
const fail = (msg) => {
  console.error(`\n✘ KHÔNG ĐƯỢC PUSH: ${msg}\n  Sửa xong rồi push lại. Không dùng --no-verify để bỏ qua kiểm tra.\n`)
  process.exit(1)
}
const step = (label, cmd, args, cwd = ROOT) => {
  process.stdout.write(`\n▶ ${label}\n`)
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: isWin })
  if (r.status !== 0) fail(`bước "${label}" không qua`)
  console.log(`✓ ${label}`)
}

// 0. The checks must run on EXACTLY what is being pushed: no uncommitted changes to tracked files,
//    no untracked files inside code folders (they would be built/tested but not pushed).
{
  const st = spawnSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: ROOT, encoding: 'utf8' }).stdout.split('\n').filter(Boolean)
  const tracked = st.filter((l) => !l.startsWith('??'))
  const strayCode = st.filter((l) => l.startsWith('??') && /^\?\? (src|server\/src|scripts|public)\//.test(l))
  if (tracked.length) fail(`còn thay đổi chưa commit — kiểm tra phải chạy đúng bản sẽ đẩy lên:\n    ${tracked.join('\n    ')}`)
  if (strayCode.length) fail(`có file chưa commit nằm trong thư mục code (script tạm? file .js sinh nhầm?):\n    ${strayCode.join('\n    ')}`)
  console.log('✓ Thư mục làm việc sạch — kiểm tra đúng bản sẽ đẩy lên')
}

step('Lint (oxlint)', 'npm', ['run', 'lint'])
step('Test frontend (tính điểm, học phí, đồng bộ…)', 'npm', ['run', 'test'])
step('Build frontend', 'npm', ['run', 'build'])
step('Test server (quy tắc an toàn dữ liệu)', 'npm', ['run', 'test'], join(ROOT, 'server'))
step('Build server', 'npm', ['run', 'build'], join(ROOT, 'server'))

// 6. Browser smoke test: open the built app in headless Edge/Chrome and import EVERY built chunk —
//    catches runtime errors at module load (wrong hook order, missing export...) that tsc/tests miss.
await smokeTest()
console.log(`\n✓ TẤT CẢ KIỂM TRA ĐẠT (${Math.round((Date.now() - started) / 1000)} giây) — được phép push.\n`)

async function smokeTest() {
  process.stdout.write('\n▶ Chạy thử bản build trong trình duyệt (nạp mọi phần của app)\n')
  const dist = join(ROOT, 'dist')
  const chunks = readdirSync(join(dist, 'assets')).filter((f) => f.endsWith('.js'))
  const browser = [
    process.env.PREPUSH_BROWSER,
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/chromium',
  ].find((p) => p && existsSync(p))
  if (!browser) fail('không tìm thấy Edge/Chrome để chạy thử bản build (đặt PREPUSH_BROWSER=đường dẫn trình duyệt)')

  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon', '.woff2': 'font/woff2' }
  const server = createServer((req, res) => {
    let p = join(dist, decodeURIComponent(new URL(req.url, 'http://x').pathname))
    if (!p.startsWith(dist) || !existsSync(p) || statSync(p).isDirectory()) p = join(dist, 'index.html')
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] ?? 'application/octet-stream' })
    res.end(readFileSync(p))
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const appUrl = `http://127.0.0.1:${server.address().port}/`
  const profile = mkdtempSync(join(tmpdir(), 'prepush-'))
  const port = 9300 + Math.floor(Math.random() * 500)
  const proc = spawn(browser, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, appUrl], { stdio: 'ignore' })
  const cleanup = () => {
    if (isWin) spawnSync('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore' })
    else proc.kill('SIGKILL')
    server.close()
    setTimeout(() => { try { rmSync(profile, { recursive: true, force: true }) } catch { /* profile still locked */ } }, 1500)
  }
  try {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    let page
    for (let i = 0; i < 60 && !page; i++) {
      try { page = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page' && t.url.startsWith(appUrl)) } catch { /* browser starting */ }
      if (!page) await sleep(500)
    }
    if (!page) throw new Error('trình duyệt không mở được trang app')
    const ws = new WebSocket(page.webSocketDebuggerUrl)
    await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j) })
    const errors = []
    const pending = new Map()
    let id = 0
    ws.addEventListener('message', (e) => {
      const m = JSON.parse(e.data)
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
      if (m.method === 'Runtime.exceptionThrown') errors.push((m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text).slice(0, 300))
    })
    const send = (method, params = {}) => new Promise((r) => { const my = ++id; pending.set(my, r); ws.send(JSON.stringify({ id: my, method, params })) })
    await send('Runtime.enable')
    await send('Page.enable')
    await send('Page.reload', { ignoreCache: true })
    await sleep(4000)
    const failed = []
    for (const c of chunks) {
      const r = await send('Runtime.evaluate', { expression: `import('/assets/${c}').then(() => 'ok', (e) => 'FAIL ' + (e && e.message))`, awaitPromise: true, returnByValue: true })
      if (r.result?.result?.value !== 'ok') failed.push(`${c}: ${r.result?.result?.value}`)
    }
    const shown = await send('Runtime.evaluate', { expression: '(document.querySelector("#root")?.innerText || "").trim().length', returnByValue: true })
    ws.close()
    if (failed.length) throw new Error(`${failed.length}/${chunks.length} phần của app lỗi khi nạp:\n    ${failed.join('\n    ')}`)
    if (errors.length) throw new Error(`lỗi khi chạy trang:\n    ${[...new Set(errors)].slice(0, 10).join('\n    ')}`)
    if (!shown.result?.result?.value) throw new Error('trang app trắng (không hiện nội dung)')
    console.log(`✓ Chạy thử bản build: nạp đủ ${chunks.length} phần của app, trang hiện bình thường, không lỗi`)
  } catch (e) {
    cleanup()
    fail(`chạy thử bản build trong trình duyệt: ${e.message}`)
  }
  cleanup()
}
