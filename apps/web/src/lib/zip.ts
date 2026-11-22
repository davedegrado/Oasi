/**
 * ZIP minimale senza compressione ("store"). PDF e immagini sono già compressi:
 * ricomprimerli non riduce il peso e costa solo tempo. Un unico file invece di
 * tanti download separati.
 */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(data: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export interface ZipEntry {
  name: string
  data: Uint8Array
}

export function makeZip(entries: ZipEntry[]): Blob {
  const enc = new TextEncoder()
  const parts: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  const used = new Set<string>()
  for (const e of entries) {
    // Nomi unici dentro l'archivio
    let name = e.name
    for (let i = 2; used.has(name); i++) name = e.name.replace(/(\.[^.]*)?$/, (ext) => ` (${i})${ext}`)
    used.add(name)
    const nameBytes = enc.encode(name)
    const crc = crc32(e.data)
    const local = new Uint8Array(30 + nameBytes.length)
    const v = new DataView(local.buffer)
    v.setUint32(0, 0x04034b50, true)
    v.setUint16(4, 20, true)
    v.setUint16(6, 0x0800, true) // nomi in UTF-8
    v.setUint16(8, 0, true) // nessuna compressione
    v.setUint32(14, crc, true)
    v.setUint32(18, e.data.length, true)
    v.setUint32(22, e.data.length, true)
    v.setUint16(26, nameBytes.length, true)
    local.set(nameBytes, 30)
    const cd = new Uint8Array(46 + nameBytes.length)
    const w = new DataView(cd.buffer)
    w.setUint32(0, 0x02014b50, true)
    w.setUint16(4, 20, true)
    w.setUint16(6, 20, true)
    w.setUint16(8, 0x0800, true)
    w.setUint32(16, crc, true)
    w.setUint32(20, e.data.length, true)
    w.setUint32(24, e.data.length, true)
    w.setUint16(28, nameBytes.length, true)
    w.setUint32(42, offset, true)
    cd.set(nameBytes, 46)
    parts.push(local, e.data)
    central.push(cd)
    offset += local.length + e.data.length
  }
  const size = central.reduce((s, c) => s + c.length, 0)
  const end = new Uint8Array(22)
  const x = new DataView(end.buffer)
  x.setUint32(0, 0x06054b50, true)
  x.setUint16(8, entries.length, true)
  x.setUint16(10, entries.length, true)
  x.setUint32(12, size, true)
  x.setUint32(16, offset, true)
  return new Blob([...parts, ...central, end] as BlobPart[], { type: 'application/zip' })
}

export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const b64 = dataUrl.split(',')[1] ?? ''
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}

export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
