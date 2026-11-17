import { loadEnvFile } from 'node:process'
import { fileURLToPath } from 'node:url'

try {
  loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url)))
} catch (error) {
  if (error.code !== 'ENOENT') throw error
}

const production = process.env.NODE_ENV === 'production'
const appUrl = new URL(process.env.PUBLIC_APP_URL || 'http://localhost:5173')
const timeZone = process.env.SHOP_TIME_ZONE || 'Asia/Kolkata'

if (!['http:', 'https:'].includes(appUrl.protocol) || appUrl.pathname !== '/' ||
    appUrl.username || appUrl.password || appUrl.search || appUrl.hash) {
  throw new Error('PUBLIC_APP_URL must be an HTTP(S) origin')
}
if (production && appUrl.protocol !== 'https:') {
  throw new Error('Use an HTTPS PUBLIC_APP_URL in production')
}

export const config = {
  production,
  appUrl: appUrl.origin,
  secureCookies: appUrl.protocol === 'https:',
  timeZone,
  mongoUri: process.env.MONGO_URI,
  jwtSecret: process.env.JWT_SECRET,
  port: Number(process.env.PORT || 5001),
  proxyHops: Number(process.env.TRUST_PROXY_HOPS || 0),
}

const dayFormat = new Intl.DateTimeFormat('en', {
  timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
})
export function shopDay(date = new Date()) {
  const parts = Object.fromEntries(dayFormat.formatToParts(date).map(({ type, value }) => [type, value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}
