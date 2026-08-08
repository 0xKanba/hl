/* build.mjs — يشتغل تلقائياً على سيرفرات Cloudflare Pages، ما يحتاج جهاز محلي.
   npm ci && npm run build */
import { build } from 'esbuild';

const appId    = process.env.PRIVY_APP_ID;
const clientId = process.env.PRIVY_CLIENT_ID;

if (!appId)    console.warn('WARNING: PRIVY_APP_ID not set — add it in Cloudflare Pages env vars.');
if (!clientId) console.warn('WARNING: PRIVY_CLIENT_ID not set — add it in Cloudflare Pages env vars.');

await build({
  entryPoints: ['src/index.jsx'],
  bundle: true,
  minify: true,
  format: 'iife',
  jsx: 'automatic',
  define: {
    'process.env.NODE_ENV':        '"production"',
    'process.env.PRIVY_APP_ID':    JSON.stringify(appId || ''),
    'process.env.PRIVY_CLIENT_ID': JSON.stringify(clientId || ''),
  },
  outfile: '../js/privy-bridge.js',
});

console.log('privy-bridge.js built. appId:', appId ? appId.slice(0,6)+'...' : '(EMPTY)',
            '| clientId:', clientId ? clientId.slice(0,10)+'...' : '(EMPTY)');
