/* ═══════════════════════════════════════════════════════════════
   privy-bridge — React island مستقل، بدون واجهة مرئية خاصة به.
   يفتح مودال Privy الجاهز (بريد) ويعرض واجهة برمجية بسيطة على
   window.PrivyBridge يستدعيها auth.js (vanilla JS).

   لا تعدّل الناتج js/privy-bridge.js مباشرة — عدّل هذا الملف؛
   Cloudflare Pages يبنيه تلقائياً عند كل push (راجع build.mjs).

   • useEffect لا يُعيد إرسال privy:update إلا عند تغيّر بصمة الحالة الفعلية.
   • فشل switchChain(42161) يُسجَّل بدل ابتلاعه بصمت.
   • "تصدير المحفظة" (useExportWallet) هو النسخ الاحتياطي الوحيد.
   • ✅ سيولتي — اسم التطبيق بمودال Privy "سيولتي" وشعاره من /icons/.
     ⚠️ لازم إضافة https://s.kanba.pw إلى Allowed origins بلوحة Privy،
     وضبط PRIVY_APP_ID / PRIVY_CLIENT_ID بمتغيّرات بيئة مشروع Pages الجديد.
═══════════════════════════════════════════════════════════════ */
import React, { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import {
  PrivyProvider,
  usePrivy,
  useWallets,
  useSignTypedData,
  useExportWallet,
} from '@privy-io/react-auth';

/* App ID + Client ID يُحقنان وقت البناء من متغيّرات بيئة (راجع build.mjs) */
const PRIVY_APP_ID    = process.env.PRIVY_APP_ID;
const PRIVY_CLIENT_ID = process.env.PRIVY_CLIENT_ID;

function Bridge() {
  const { ready, authenticated, login, logout } = usePrivy();
  const { wallets } = useWallets();
  const { signTypedData } = useSignTypedData();
  const { exportWallet } = useExportWallet();

  /* مرجع حي يتفادى الـ stale closures جوا window.PrivyBridge */
  const live = useRef({ ready, authenticated, wallets });
  live.current = { ready, authenticated, wallets };

  /* بصمة آخر إرسال — تمنع privy:update المتكرر بلا فائدة */
  const lastDispatchSig = useRef('');

  useEffect(() => {
    function activeWallet() {
      const w = live.current.wallets[0];
      if (!w) return null;
      return {
        address: w.address,
        walletClientType: w.walletClientType,
        name: w.meta?.name || w.walletClientType,
        icon: w.meta?.icon || null,
      };
    }

    window.PrivyBridge = {
      get ready()          { return live.current.ready; },
      get authenticated()  { return live.current.authenticated; },

      /* يفتح مودال Privy الرسمي (بريد) */
      connect: () => login(),
      logout:  () => logout(),

      getActiveWallet: activeWallet,

      /* توقيع EIP-712 — يطابق ethers.Wallet.signTypedData(domain, types, value) */
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

      /* Signer متصل بـArbitrum جاهز لعقود USDC/الجسر (يستخدم doDeposit) */
      getArbitrumSigner: async (address) => {
        const target = address || activeWallet()?.address;
        const w = live.current.wallets.find(x => x.address === target);
        if (!w) throw new Error('no wallet connected');
        try {
          await w.switchChain(42161);
        } catch (err) {
          console.warn('[Privy] switchChain(42161) failed:', err);
        }
        const provider = await w.getEthereumProvider();
        const bp = new window.ethers.BrowserProvider(provider);
        return bp.getSigner();
      },
    };

    const w = activeWallet();
    const sig = `${ready}|${authenticated}|${w?.address || ''}|${w?.walletClientType || ''}`;
    if (sig === lastDispatchSig.current) return;
    lastDispatchSig.current = sig;

    window.dispatchEvent(new CustomEvent('privy:update', {
      detail: { ready, authenticated, wallet: w }
    }));
  }, [ready, authenticated, wallets, login, logout, signTypedData, exportWallet]);

  return null; /* headless تماماً — modalLogin بالتطبيق هو الواجهة */
}

const mountNode = document.getElementById('privyRoot');
createRoot(mountNode).render(
  <PrivyProvider
    appId={PRIVY_APP_ID}
    clientId={PRIVY_CLIENT_ID}
    config={{
      /* Privy خاص بالبريد الإلكتروني فقط — المحافظ الخارجية عبر wallets.js */
      loginMethods: ['email'],
      embeddedWallets: {
        createOnLogin: 'users-without-wallets',
      },
      appearance: {
        name: 'سيولتي',
        theme: 'dark',
        accentColor: '#8b5cf6',
        logo: '/icons/icon-192x192.png',
      },
    }}
  >
    <Bridge />
  </PrivyProvider>
);
