// 本机与测试用：把 apps/prep-web/out（或测试夹具目录）托管在 127.0.0.1 的随机端口。生产由 frontend 的 Nginx 托管同一份文件。
import { createReadStream, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve, sep } from 'node:path'

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.map': 'application/json', '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.wasm': 'application/wasm',
}

export async function startStaticServer(root: string, port = 0): Promise<{ origin: string; close(): Promise<void> }> {
  const base = resolve(root)
  const server = createServer((req, res) => {
    let pathname: string
    try { pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://local').pathname) } catch { res.writeHead(400).end(); return }
    let file = normalize(join(base, pathname))
    if (file !== base && !file.startsWith(base + sep)) { res.writeHead(403).end(); return }
    try {
      if (statSync(file).isDirectory()) file = join(file, 'index.html')
      const size = statSync(file).size
      res.writeHead(200, { 'content-type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream', 'content-length': size })
      createReadStream(file).pipe(res)
    } catch {
      res.writeHead(404).end()
    }
  })
  await new Promise<void>((ready) => server.listen(port, '127.0.0.1', ready))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('static server has no port')
  return { origin: `http://127.0.0.1:${address.port}`, close: () => new Promise<void>((done) => server.close(() => done())) }
}
