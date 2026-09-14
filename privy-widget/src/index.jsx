/* ═══════════════════════════════════════════════════════════════
   privy-bridge — React island مستقل، بدون واجهة مرئية خاصة به.
   يفتح مودال Privy الجاهز (بريد + محافظ خارجية) ويعرض واجهة برمجية
   بسيطة على window.PrivyBridge يستدعيها auth.js (vanilla JS).

   لا تعدّل هذا الملف مباشرة بالمتصفح — عدّل src/index.jsx وأعد البناء:
     cd privy-widget && npm run build
   الناتج ينسخ يدوياً إلى /js/privy-bridge.js بمشروع سيولة.
   (على Cloudflare Pages هذا يحدث تلقائياً عند كل push — لا حاجة لبناء
   يدوي محلي في الاستخدام العادي.)

   ✅ إصلاح: useEffect كان يُعيد إرسال privy:update عند أي تغيّر بمرجع
      مصفوفة wallets حتى لو الحالة الفعلية (ready/authenticated/العنوان
      النشط) لم تتغيّر إطلاقاً — بعض تطبيقات hooks لا تُثبِّت مرجع
      المصفوفة بين كل تصيير. كان هذا يُشعِّل auth.js's listener بشكل
      متكرر بلا داعٍ (محمي بفحص العنوان المتطابق هناك، فلا خلل وظيفي،
      لكنه إهدار وسبب احتمالي لسباقات مستقبلية لو تغيّر ذاك الفحص).
      الآن نقارن بصمة الحالة المؤثرة فعلياً فقط قبل الإرسال.
   ✅ إصلاح: فشل تبديل الشبكة لـArbitrum بمحفظة Privy المدمجة كان
      يُبتلع بصمت (catch فاضي) — أي فشل حقيقي هنا يجب أن يظهر بالسجل
      بدل الاختفاء، لتسهيل تشخيص أي فشل إيداع لاحق ناتج عنه.
   ✅ حُذف useSetWalletRecovery/setupRecovery بالكامل — "استرداد
      المحفظة" أُزيل من التطبيق (راجع auth.js/index.html)، فـ"تصدير
      المحفظة" (useExportWallet أدناه) يكفي وحده كنسخة احتياطية حقيقية
      (يعرض المفتاح الخاص/العبارة السرية مباشرة)، وكان وجود الاثنين
      تكراراً بلا فائدة إضافية حقيقية للمستخدم.
   ✅ إعادة تلوين (2026-08) — accentColor مودال Privy كان #00ccff
      (سماوي)، بلا أي علاقة بلوحة التطبيق. الآن #8b5cf6 (نفس البنفسجي
      الأساسي بكل مكان آخر) — نافذة الدخول بالبريد تطابق هوية التطبيق
      بصرياً بدل الظهور بلون غريب منفصل.
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

  /* مرجع حي يتفادى الـ stale closures جوا window.PrivyBridge */
  const live = useRef({ ready, authenticated, wallets });
  live.current = { ready, authenticated, wallets };

  /* ✅ بصمة آخر إرسال — تمنع privy:update المتكرر بلا فائدة (راجع تعليق الرأس) */
  const lastDispatchSig = useRef('');

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

      /* يفتح مودال Privy الآمن لتصدير المفتاح/الـ seed phrase —
         المسار الوحيد الآن للنسخ الاحتياطي (راجع تعليق رأس الملف) */
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

  return null; /* headless تماماً — modalLogin بتاع سيولة يبقى هو الواجهة */
}

const mountNode = document.getElementById('privyRoot');
createRoot(mountNode).render(
  <PrivyProvider
    appId={PRIVY_APP_ID}
    clientId={PRIVY_CLIENT_ID}
    config={{
      /* ✅ Privy الآن خاص بالبريد الإلكتروني فقط — الاتصال بمحافظ خارجية
         (Trust/Brave/أي محفظة) صار بملف wallets.js منفصل تماماً، بلا
         أي اعتماد على Privy أو WalletConnect. */
      loginMethods: ['email'],
      embeddedWallets: {
        createOnLogin: 'users-without-wallets',
      },
      appearance: {
        name: 'ماركت ليك',
        theme: 'dark',
        accentColor: '#8b5cf6',
        logo: 'https://hl.kanba.pw/images/icon-192x192.png',
      },
    }}
  >
    <Bridge />
  </PrivyProvider>
);
