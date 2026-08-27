async function main() {
  const courseId = process.argv[2]
  if (!courseId) {
    throw new Error('Usage: npm run video:render -- <courseId>')
  }

  const secondsArg = process.argv.find(arg => arg.startsWith('--seconds-per-atom='))
  const secondsPerAtom = secondsArg ? Number(secondsArg.split('=')[1]) : undefined
  const baseUrl = process.env.MAOLAB_APP_URL ?? 'http://127.0.0.1:3000'
  const res = await fetch(`${baseUrl}/api/v2/export-video/${encodeURIComponent(courseId)}?json=1`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      ...(typeof secondsPerAtom === 'number' && Number.isFinite(secondsPerAtom) ? { secondsPerAtom } : {}),
    }),
  })

  const text = await res.text()
  if (!res.ok) {
    throw new Error(`video export failed: HTTP ${res.status}\n${text}`)
  }
  console.log(text)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
