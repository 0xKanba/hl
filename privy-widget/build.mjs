/* build.mjs — يشتغل محلياً (لو حبيت) أو تلقائياً على سيرفرات Cloudflare Pages.
   ما يحتاج منك أي شي غير: npm ci && npm run build */
import { build } from 'esbuild';

const appId = process.env.PRIVY_APP_ID;
if (!appId) {
  console.warn('WARNING: PRIVY_APP_ID not set in environment — add it in Cloudflare Pages settings.');
}

await build({
  entryPoints: ['src/index.jsx'],
  bundle: true,
  minify: true,
  format: 'iife',
  jsx: 'automatic',
  define: {
    'process.env.NODE_ENV':     '"production"',
    'process.env.PRIVY_APP_ID': JSON.stringify(appId || ''),
  },
  outfile: '../js/privy-bridge.js',
});

console.log('privy-bridge.js built. App ID prefix:', appId ? appId.slice(0, 6) + '...' : '(EMPTY - see warning above)');
