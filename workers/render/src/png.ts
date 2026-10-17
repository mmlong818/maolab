/** 读 PNG 的 IHDR 宽高（导出核对与测试用） */
export function pngSize(png: Uint8Array): { width: number; height: number } {
  const buf = Buffer.from(png.buffer, png.byteOffset, png.byteLength)
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47 || buf.readUInt32BE(12) !== 0x49484452) throw new Error('not a PNG')
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}
