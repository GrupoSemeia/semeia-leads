import { describe, it, expect } from 'vitest'
import { detectarImagem, decodificarBase64, escolherImagens, chaveDaImagem, prepararImagem, MAX_BYTES_IMAGEM } from './imagens'

const b64 = (bytes: number[]) => btoa(String.fromCharCode(...bytes))
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0], JPG = [0xff, 0xd8, 0xff, 0xe0, 0, 0x10], WEBP = [...'RIFF'].map(c => c.charCodeAt(0)).concat([0, 0, 0, 0], [...'WEBP'].map(c => c.charCodeAt(0)))

describe('detectarImagem (pelo conteúdo)', () => {
  it('reconhece JPEG, PNG e WEBP', () => { expect(detectarImagem(new Uint8Array(JPG))?.mime).toBe('image/jpeg'); expect(detectarImagem(new Uint8Array(PNG))?.ext).toBe('png'); expect(detectarImagem(new Uint8Array(WEBP))?.mime).toBe('image/webp') })
  it('recusa SVG, GIF, HTML, executável e arquivo curto', () => {
    const enc = (s: string) => new TextEncoder().encode(s)
    for (const x of [enc('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), enc('GIF89a....'), enc('<html><script>x</script>'), new Uint8Array([0x4d, 0x5a, 0x90, 0]), new Uint8Array([0xff, 0xd8]), new Uint8Array([])]) expect(detectarImagem(x)).toBeNull()
  })
  it('RIFF que não é WEBP (ex.: WAV) não passa', () => { expect(detectarImagem(new Uint8Array([...'RIFF'].map(c => c.charCodeAt(0)).concat([0, 0, 0, 0], [...'WAVE'].map(c => c.charCodeAt(0)))))).toBeNull() })
})

describe('decodificarBase64', () => {
  it('decodifica, aceitando prefixo data: e quebras de linha', () => { expect([...decodificarBase64(b64(JPG))!]).toEqual(JPG); expect([...decodificarBase64('data:image/jpeg;base64,' + b64(JPG).replace(/(.{4})/g, '$1\n'))!]).toEqual(JPG) })
  it('recusa lixo, texto que não é base64 e tipos errados', () => { for (const x of ['', '***', '<svg>', 'abc$', null, undefined, 42, {}]) expect(decodificarBase64(x as any)).toBeNull() })
  it('recusa o que passa do limite sem decodificar', () => { expect(decodificarBase64('A'.repeat(Math.ceil(MAX_BYTES_IMAGEM * 4 / 3) + 100))).toBeNull(); expect(decodificarBase64(btoa('x'.repeat(200)), 100)).toBeNull(); expect(decodificarBase64(btoa('x'.repeat(100)), 100)).not.toBeNull() })
})

describe('escolherImagens / chave / prepararImagem', () => {
  it('ordena pela ordem do ERP e limita a 3', () => { expect(escolherImagens([{ ordem: 5, base64: 'c' }, { ordem: 1, base64: 'a' }, { ordem: 3, base64: 'b' }, { ordem: 9, base64: 'd' }]).map(i => i.base64)).toEqual(['a', 'b', 'c']) })
  it('a chave nunca leva texto do ERP e fica dentro da pasta da empresa', () => { expect(chaveDaImagem('t-1', 100, 0, 'abcdef0123456789ffff', 'png')).toBe('t-1/100/0-abcdef0123456789.png') })
  it('prepararImagem: ok, formato proibido e inválida', () => {
    expect(prepararImagem(b64(PNG))).toMatchObject({ ok: true, tipo: { mime: 'image/png' } })
    expect(prepararImagem(btoa('<svg onload=alert(1)>'))).toEqual({ ok: false, motivo: 'formato' })
    expect(prepararImagem('%%%')).toEqual({ ok: false, motivo: 'invalida' })
  })
})
