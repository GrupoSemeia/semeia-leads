// Gera o par de chaves das notificações no aparelho (VAPID). Uso: node scripts/gerar-vapid.mjs
// A chave PÚBLICA vai em wrangler.jsonc (vars.VAPID_PUBLIC_KEY). A PRIVADA é segredo: npx wrangler secret put VAPID_PRIVATE_KEY (ou painel do Worker). Nunca commite a privada.
import { generateKeyPairSync } from 'node:crypto'
const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
const pub = publicKey.export({ format: 'jwk' }), priv = privateKey.export({ format: 'jwk' })
const b = s => Buffer.from(s, 'base64url')
console.log('VAPID_PUBLIC_KEY  =', Buffer.concat([Buffer.from([4]), b(pub.x), b(pub.y)]).toString('base64url'))
console.log('VAPID_PRIVATE_KEY =', priv.d)
