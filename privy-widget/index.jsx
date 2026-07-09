/* ═══════════════════════════════════════════════════════════════
   privy-bridge — React island مستقل، بدون واجهة مرئية خاصة به.
   يفتح مودال Privy الجاهز (بريد + محافظ خارجية) ويعرض واجهة برمجية
   بسيطة على window.PrivyBridge يستدعيها auth.js (vanilla JS).

   لا تعدّل هذا الملف مباشرة بالمتصفح — عدّل src/index.jsx وأعد البناء:
     cd privy-widget && npm run build
   الناتج ينسخ يدوياً إلى /js/privy-bridge.js بمشروع سيولة.
═══════════════════════════════════════════════════════════════ */
import React, { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import {
  PrivyProvider,
  usePrivy,
  useWallets,
  useSignTypedData,
  useExportWallet,
  useSetWalletRecovery,
} from '@privy-io/react-auth';

/* App ID + Client ID يُحقنان وقت البناء من متغيّرات بيئة (راجع build.mjs) —
   على Cloudflare Pages: Settings → Environment variables → PRIVY_APP_ID, PRIVY_CLIENT_ID.
   لا حاجة لتعديل هذا الملف يدوياً أبداً. */
const PRIVY_APP_ID    = process.env.PRIVY_APP_ID;
const PRIVY_CLIENT_ID = process.env.PRIVY_CLIENT_ID;

function Bridge() {
  const { ready, authenticated, login, logout } = usePrivy();
  const { wallets } = useWallets();
  const { signTypedData } = useSignTypedData();
  const { exportWallet } = useExportWallet();
  const { setWalletRecovery } = useSetWalletRecovery();

  /* مرجع حي يتفادى الـ stale closures جوا window.PrivyBridge */
  const live = useRef({ ready, authenticated, wallets });
  live.current = { ready, authenticated, wallets };

  useEffect(() => {
    function activeWallet() {
      const w = live.current.wallets[0];
      if (!w) return null;
      return {
        address: w.address,
        walletClientType: w.walletClientType,
        name: w.meta?.name || w.walletClientType,   // "Brave Wallet" / "Trust Wallet" / "Rabby" مباشرة من EIP-6963
        icon: w.meta?.icon || null,
      };
    }

    window.PrivyBridge = {
      get ready()          { return live.current.ready; },
      get authenticated()  { return live.current.authenticated; },

      /* يفتح مودال Privy الرسمي (بريد أولاً، محافظ خارجية تحته) */
      connect: () => login(),
      logout:  () => logout(),

      getActiveWallet: activeWallet,

      /* توقيع EIP-712 — يطابق توقيع ethers.Wallet.signTypedData(domain, types, value)
         بحيث api.js و account.js ما يحتاجون يتغيروا إذا صار State.wallet = هذا الجسر */
      signTypedData: async (domain, types, value, address) => {
        const primaryType = Object.keys(types)[0];
        const target = address || activeWallet()?.address;
        const { signature } = await signTypedData(
          { domain, types, primaryType, message: value },
          { address: target }
        );
        return signature;
      },

      /* يفتح مودال Privy الآمن لتصدير المفتاح/الـ seed phrase */
      exportWallet: (address) => exportWallet(address ? { address } : undefined),

      /* يفتح مودال Privy لتفعيل استرداد المحفظة (كلمة سر / Google Drive / iCloud) —
         حماية إضافية ضد فقدان الجهاز لمحفظة embedded (بريد) تحديداً */
      setupRecovery: () => setWalletRecovery(),

      /* Signer متصل بـ Arbitrum جاهز لعقود USDC/الجسر (يستخدم doDeposit) */
      getArbitrumSigner: async (address) => {
        const target = address || activeWallet()?.address;
        const w = live.current.wallets.find(x => x.address === target);
        if (!w) throw new Error('no wallet connected');
        try { await w.switchChain(42161); } catch (_) {}
        const provider = await w.getEthereumProvider();
        const bp = new window.ethers.BrowserProvider(provider);
        return bp.getSigner();
      },
    };

    window.dispatchEvent(new CustomEvent('privy:update', {
      detail: { ready, authenticated, wallet: activeWallet() }
    }));
  }, [ready, authenticated, wallets, login, logout, signTypedData, exportWallet, setWalletRecovery]);

  return null; /* headless تماماً — modalLogin بتاع سيولة يبقى هو الواجهة */
}

const mountNode = document.getElementById('privyRoot');
createRoot(mountNode).render(
  <PrivyProvider
    appId={PRIVY_APP_ID}
    clientId={PRIVY_CLIENT_ID}
    config={{
      loginMethods: ['email', 'wallet'],
      embeddedWallets: {
        createOnLogin: 'users-without-wallets',
      },
      appearance: {
        theme: 'dark',
        accentColor: '#00ccff',
        logo: 'https://hl.kanba.pw/icon-512x512.png',
        /* ✅ Trust Wallet وRabby ما إلهم زر مباشر بقائمة Privy (مو مدرجين
           بالأسماء الخاصة) — الطريقة الوحيدة للوصول لهم فعلياً هي
           wallet_connect (سجل WalletConnect الكامل، +100 محفظة).
           بدونها، الضغط على "اتصال" داخل Trust Wallet كان ينتهي بمهلة
           لأن Privy ما كان يعرف كيف يوصل لها أصلاً. */
        walletList: ['metamask', 'coinbase_wallet', 'detected_ethereum_wallets', 'wallet_connect'],
      },
    }}
  >
    <Bridge />
  </PrivyProvider>
);
