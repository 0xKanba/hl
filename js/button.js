/* ═══════════════════════════════════════
   pwa-install.js — زر تثبيت PWA
   ضعه قبل </body> مباشرة
═══════════════════════════════════════ */
(function () {
  'use strict';

  let _prompt = null;

  /* ── إنشاء الزر ── */
  const btn = document.createElement('button');
  btn.id        = 'pwaInstallBtn';
  btn.innerHTML = '⬇️ تثبيت التطبيق';
  btn.setAttribute('aria-label', 'تثبيت HLTrade على الجهاز');

  const style = document.createElement('style');
  style.textContent = `
#pwaInstallBtn {
  position: fixed;
  top: 21px;          /* فوق الفوتر */
  left: 50%;
  transform: translateX(-50%) translateY(20px);
  z-index: 900;

  display: none;
  align-items: center;
  gap: 6px;
  padding: 10px 22px;
  border-radius: 999px;

  background: rgba(201, 100, 66, 0.18);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1.5px solid rgba(201, 100, 66, 0.45);
  color: #e07248;

  font-family: 'Cairo', sans-serif;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
  white-space: nowrap;

  box-shadow: 0 4px 20px rgba(0,0,0,.3);
  transition: opacity .25s, transform .3s;
  opacity: 0;
}
#pwaInstallBtn.visible {
  display: flex;
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}
#pwaInstallBtn:active {
  transform: translateX(-50%) scale(.95);
  filter: brightness(.9);
}
`;
  document.head.appendChild(style);
  document.body.appendChild(btn);

  /* ── استقبال حدث التثبيت ── */
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    _prompt = e;
    btn.classList.add('visible');
  });

  /* ── نقر الزر ── */
  btn.addEventListener('click', async () => {
    if (!_prompt) return;
    _prompt.prompt();
    const { outcome } = await _prompt.userChoice;
    if (outcome === 'accepted') btn.classList.remove('visible');
    _prompt = null;
  });

  /* ── إخفاء الزر بعد التثبيت ── */
  window.addEventListener('appinstalled', () => {
    btn.classList.remove('visible');
    _prompt = null;
  });
})();
