// Um leitor de PNG mínimo para os testes no Node (sem canvas): 8 bits por canal, RGB ou RGBA, sem
// entrelaçamento, os cinco filtros. Devolve { w, h, dados } com os pixels em RGBA, como o getImageData.
import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'

export function lerPng(caminho) {
  const b = readFileSync(caminho)
  let o = 8
  let w = 0, h = 0, tipo = 0
  const partes = []
  while (o < b.length) {
    const n = b.readUInt32BE(o)
    const t = b.toString('ascii', o + 4, o + 8)
    const d = b.subarray(o + 8, o + 8 + n)
    if (t === 'IHDR') {
      w = d.readUInt32BE(0)
      h = d.readUInt32BE(4)
      if (d[8] !== 8 || d[12] !== 0) throw new Error('PNG: só 8 bits sem entrelaçamento')
      tipo = d[9]
    } else if (t === 'IDAT') partes.push(d)
    else if (t === 'IEND') break
    o += 12 + n
  }
  const bpp = tipo === 6 ? 4 : tipo === 2 ? 3 : 0
  if (!bpp) throw new Error(`PNG: tipo de cor ${tipo} não suportado`)
  const cru = inflateSync(Buffer.concat(partes))
  const linha = w * bpp
  const atual = new Uint8Array(linha)
  let anterior = new Uint8Array(linha)
  const dados = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    const f = cru[y * (linha + 1)]
    const src = cru.subarray(y * (linha + 1) + 1, (y + 1) * (linha + 1))
    for (let i = 0; i < linha; i++) {
      const a = i >= bpp ? atual[i - bpp] : 0
      const c = anterior[i]
      const ca = i >= bpp ? anterior[i - bpp] : 0
      let v = src[i]
      if (f === 1) v += a
      else if (f === 2) v += c
      else if (f === 3) v += (a + c) >> 1
      else if (f === 4) {
        const p = a + c - ca
        const pa = Math.abs(p - a), pb = Math.abs(p - c), pc = Math.abs(p - ca)
        v += pa <= pb && pa <= pc ? a : pb <= pc ? c : ca
      }
      atual[i] = v & 255
    }
    for (let x = 0; x < w; x++) {
      const k = (y * w + x) * 4
      dados[k] = atual[x * bpp]
      dados[k + 1] = atual[x * bpp + 1]
      dados[k + 2] = atual[x * bpp + 2]
      dados[k + 3] = bpp === 4 ? atual[x * bpp + 3] : 255
    }
    anterior = Uint8Array.from(atual)
  }
  return { w, h, dados }
}
