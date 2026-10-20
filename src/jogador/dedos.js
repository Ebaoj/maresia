import * as THREE from 'three'
import { nomeCanonico } from './esqueleto.js'
const ehTrilhaDedo = t => /^(Left|Right)Hand(Thumb|Index|Middle|Ring|Pinky)[1-4]$/.test(nomeCanonico(t.name.replace(/\.quaternion$/, '')))

// As poses vêm de outra caminhada gravada. Só as falanges são substituídas;
// o corpo mantém a passada original, e as duas mãos conservam sua assimetria.
export function usarDedosGravados(clipe, referencia, { fechamento = .12, fps = 30 } = {}) {
  if (!clipe || !referencia || clipe.duration <= 0 || referencia.duration <= 0) return clipe
  const dedos = referencia.tracks.filter(t => ehTrilhaDedo(t) && t.ValueTypeName === 'quaternion')
  if (!dedos.length) return clipe
  const n = Math.max(2, Math.round(clipe.duration * fps) + 1)
  const times = Float32Array.from({ length: n }, (_, i) => clipe.duration * i / (n - 1))
  const janela = THREE.MathUtils.clamp(fechamento, 0, .45)
  const novas = dedos.map(t => {
    const interp = t.createInterpolant(), inicio = new THREE.Quaternion().fromArray(interp.evaluate(0)), atual = new THREE.Quaternion()
    const values = new Float32Array(n * 4)
    for (let i = 0; i < n; i++) {
      const fase = i / (n - 1)
      atual.fromArray(interp.evaluate(fase * referencia.duration)).normalize()
      if (janela > 0 && fase > 1 - janela) {
        const u = (fase - (1 - janela)) / janela
        atual.slerp(inicio, u * u * (3 - 2 * u))
      }
      atual.toArray(values, i * 4)
    }
    return new THREE.QuaternionKeyframeTrack(t.name, times, values)
  })
  return new THREE.AnimationClip(clipe.name, clipe.duration, [...clipe.tracks.filter(t => !ehTrilhaDedo(t)), ...novas])
}

function quadroDaPalma(rep, lado) {
  const p = n => rep.get(lado + n)?.p
  const mao = p('Hand'), meio = p('HandMiddle1'), indicador = p('HandIndex1'), minimo = p('HandPinky1')
  if (!mao || !meio || !indicador || !minimo) return null
  const y = meio.clone().sub(mao).normalize()
  const x = minimo.clone().sub(indicador).addScaledVector(y, -minimo.clone().sub(indicador).dot(y)).normalize()
  if (x.lengthSq() < .5 || y.lengthSq() < .5) return null
  const z = new THREE.Vector3().crossVectors(x, y).normalize()
  return { q: new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z)), normal: z }
}

function quadroDaFalange(rep, nome, normal) {
  const n = Number(nome.slice(-1)), filho = nome.slice(0, -1) + (n + 1)
  let direcao
  if (rep.has(filho)) direcao = rep.get(filho).p.clone().sub(rep.get(nome).p)
  else if (n > 1 && rep.has(nome.slice(0, -1) + (n - 1))) direcao = rep.get(nome).p.clone().sub(rep.get(nome.slice(0, -1) + (n - 1)).p)
  if (!direcao || direcao.lengthSq() < 1e-10) return null
  const y = direcao.normalize(), x = new THREE.Vector3().crossVectors(y, normal).normalize()
  if (x.lengthSq() < .5) return null
  const z = new THREE.Vector3().crossVectors(x, y).normalize()
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z))
}

// A abertura da mão gerada não é uma pose de repouso anatômica compatível com o Y Bot.
// Transporta a orientação das falanges no quadro da palma, compensando os eixos locais
// dos dois rigs. Assim a animação não carrega a abertura espalhada da malha alvo.
export function prepararTransferenciaDedos(fonte, alvo) {
  const dados = new Map()
  for (const lado of ['Left', 'Right']) {
    const pf = quadroDaPalma(fonte.rep, lado), pa = quadroDaPalma(alvo.rep, lado), mao = lado + 'Hand'
    if (!pf || !pa || !fonte.rep.has(mao) || !alvo.rep.has(mao)) continue
    for (const [nome, repAlvo] of alvo.rep) {
      if (!nome.startsWith(lado + 'Hand') || !/[1-4]$/.test(nome) || !fonte.rep.has(nome)) continue
      const ff = quadroDaFalange(fonte.rep, nome, pf.normal), fa = quadroDaFalange(alvo.rep, nome, pa.normal)
      if (!ff || !fa) continue
      const localFonte = fonte.rep.get(nome).q.clone().invert().multiply(ff)
      const localAlvo = repAlvo.q.clone().invert().multiply(fa)
      dados.set(nome, { mao, pf: pf.q, pa: pa.q, ajuste: localFonte.multiply(localAlvo.invert()) })
    }
  }
  return (nome, atual, mundoAlvo) => {
    const d = dados.get(nome)
    if (!d || !mundoAlvo.has(d.mao)) return null
    const palmaFonte = atual.get(d.mao).q.clone().multiply(fonte.rep.get(d.mao).q.clone().invert()).multiply(d.pf)
    const palmaAlvo = mundoAlvo.get(d.mao).clone().multiply(alvo.rep.get(d.mao).q.clone().invert()).multiply(d.pa)
    return palmaAlvo.multiply(palmaFonte.invert()).multiply(atual.get(nome).q).multiply(d.ajuste).normalize()
  }
}
