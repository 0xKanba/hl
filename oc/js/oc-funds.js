/* ═══════════════════════════════════════════════════════════════
   oc-funds.js — الإيداع والسحب

   منسوخ حرفياً من js/account.js بالمشروع الأصلي (doDeposit/doWithdraw
   ومترجمات أخطائهما) بلا أي تغيير بالمنطق — نفس عقد USDC الأصلي على
   Arbitrum، نفس عنوان جسر Bridge2، نفس بنية توقيع withdraw3 (EIP-712)،
   ونفس رسم السحب المركزي WITHDRAW_FEE_USDC من core/config.js.
   السبب الوحيد لوجوده كملف منفصل هنا: بقية account.js خاصة بأسواق
   HIP-3 (مراكز/هامش/رافعة) ولا معنى لها بأسواق التوقعات.
═══════════════════════════════════════════════════════════════ */
'use strict';

function _depositErr(msg) {
  const m = (msg || '').toLowerCase();
  if (m.includes('insufficient') || m.includes('balance')) return 'رصيد USDC غير كافٍ في محفظة Arbitrum';
  if (m.includes('rejected') || m.includes('denied') || m.includes('cancel')) return 'تم إلغاء العملية من المحفظة';
  if (m.includes('gas') || m.includes('fee')) return 'رصيد ETH غير كافٍ لرسوم شبكة Arbitrum';
  if (m.includes('network') || m.includes('timeout') || m.includes('fetch')) return 'انقطع الاتصال — تحقق من الشبكة';
  if (m.includes('nonce')) return 'تعارض في العملية — انتظر وأعد المحاولة';
  if (m.includes('revert')) return 'رفضت شبكة Arbitrum العملية — تحقق من الرصيد';
  return 'فشل الإيداع — حاول مجدداً';
}

function _withdrawErr(msg) {
  const m = (msg || '').toLowerCase();
  if (m.includes('insufficient') || m.includes('balance')) return 'رصيد غير كافٍ للسحب';
  if (m.includes('rejected') || m.includes('denied') || m.includes('cancel')) return 'تم إلغاء توقيع السحب';
  if (m.includes('destination') || m.includes('address') || m.includes('invalid')) return 'عنوان المستلم غير صالح';
  if (m.includes('network') || m.includes('timeout') || m.includes('fetch')) return 'انقطع الاتصال — تحقق من الشبكة';
  if (m.includes('rate') || m.includes('limit')) return 'طلبات كثيرة — انتظر دقيقة';
  return 'فشل السحب — حاول مجدداً';
}

/* ════ Deposit — تحويل USDC مباشر لعنوان الجسر (لا approve ولا deposit()) ════ */
async function doDeposit() {
  const amt = parseFloat($('depositAmount').value || 0);
  if (!amt || amt < 5) return toast('الحد الأدنى للإيداع $5', 'err');
  if (!State.wallet)   return toast('يجب تسجيل الدخول أولاً', 'err');
  setBtnLoading('depositExecute', '⏳');
  showLoader('جارٍ التحقق من رصيد USDC...');
  try {
    const w = await State.wallet.getArbitrumSigner();
    const usdc = new ethers.Contract(USDC_CA, [
      'function transfer(address,uint256) returns(bool)',
      'function balanceOf(address) view returns(uint256)'
    ], w);
    const raw = ethers.parseUnits(amt.toString(), 6);
    const bal = await usdc.balanceOf(State.wallet.address);
    if (bal < raw) {
      toast('⚠️ رصيد USDC غير كافٍ في محفظة Arbitrum — انظر عنوان الإيداع أدناه لإرسال USDC له أولاً', 'err', 6000);
      return;
    }
    showLoader('جارٍ إرسال USDC إلى الجسر...');
    await (await usdc.transfer(BRDG_CA, raw)).wait();
    closeModal('modalDeposit');
    toast(`✅ تم إرسال $${amt} — يصل خلال أقل من دقيقة`, 'ok', 6000);
    if (typeof _maybePromptExportBackup === 'function') _maybePromptExportBackup(State.wallet);
  } catch (e) {
    toast(`⚠️ ${_depositErr(e.message)}`, 'err', 5000);
  } finally { resetBtn('depositExecute'); hideLoader(); }
}

/* ════ Withdraw — withdraw3 موقّع بالمحفظة الرئيسية ════ */
async function doWithdraw() {
  const amt    = parseFloat($('withdrawAmount').value || 0);
  const dest   = $('withdrawAddress').value.trim();
  const minAmt = WITHDRAW_FEE_USDC + 1;
  if (!amt || amt <= 0)  return toast('أدخل المبلغ المراد سحبه', 'err');
  if (amt < minAmt)      return toast(`الحد الأدنى $${minAmt.toFixed(2)} (بعد رسوم $${WITHDRAW_FEE_USDC.toFixed(2)})`, 'err');
  if (!/^0x[0-9a-fA-F]{40}$/.test(dest)) return toast('عنوان المحفظة غير صحيح', 'err');
  if (!State.wallet)     return toast('يجب تسجيل الدخول أولاً', 'err');
  setBtnLoading('withdrawExecute', '⏳');
  showLoader('انتظر توقيع طلب السحب...');
  try {
    const nonce  = Date.now();
    const to     = dest.toLowerCase();
    const action = {
      type: 'withdraw3', hyperliquidChain: 'Mainnet',
      signatureChainId: '0xa4b1', destination: to,
      amount: amt.toFixed(2), time: nonce
    };
    const sig = await State.wallet.signTypedData(
      { name: 'HyperliquidSignTransaction', version: '1', chainId: 42161,
        verifyingContract: '0x0000000000000000000000000000000000000000' },
      { 'HyperliquidTransaction:Withdraw': [
        { name: 'hyperliquidChain', type: 'string' },
        { name: 'destination',      type: 'string' },
        { name: 'amount',           type: 'string' },
        { name: 'time',             type: 'uint64' }
      ]},
      { hyperliquidChain: 'Mainnet', destination: to, amount: action.amount, time: nonce }
    );
    const { r, s, v } = ethers.Signature.from(sig);
    showLoader('جارٍ إرسال طلب السحب...');
    const body = { action, nonce, signature: { r, s, v } };
    const d = HL.isOpen() ? await HL.post(body, true).catch(() => _restExchange(body)) : await _restExchange(body);
    if (d.status !== 'ok') throw new Error(JSON.stringify(d));
    closeModal('modalWithdraw');
    toast(`✅ طلب السحب مقبول — سيصلك $${(amt - WITHDRAW_FEE_USDC).toFixed(2)} USDC`, 'ok', 6000);
  } catch (e) {
    toast(`⚠️ ${_withdrawErr(e.message)}`, 'err', 5000);
  } finally { resetBtn('withdrawExecute'); hideLoader(); }
}

/* ════ سجل التداول — نوافذ أسواق التوقعات فقط ════ */
async function showHistory() {
  if (!State.wallet) return toast('سجّل الدخول أولاً', 'err');
  openModal('modalHistory');
  const list = $('historyList'), sub = $('historySubtitle');
  list.innerHTML = '<div class="balance-loading">⏳ جاري جلب السجل...</div>';
  try {
    let fills = OcState.fills;
    if (!fills || fills.length < 10) {
      const raw = await hlInfo({ type: 'userFills', user: State.wallet.address }).catch(() => []);
      fills = (Array.isArray(raw) ? raw : []).filter(f => typeof f.coin === 'string' && f.coin.charCodeAt(0) === 35);
    }
    fills = fills.slice().sort((a, b) => b.time - a.time).slice(0, 120);
    if (sub) sub.textContent = fills.length ? `آخر ${fills.length} تنفيذ على أسواق التوقعات` : 'لا يوجد سجل بعد';
    list.innerHTML = fills.length
      ? fills.map(f => {
          const px = parseFloat(f.px), sz = parseFloat(f.sz);
          const buy = f.side === 'B';
          return `<div class="oc-fill-row">
            <div class="oc-fill-main">
              <span class="oc-fill-dir ${buy ? 'buy' : 'sell'}">${buy ? 'شراء' : 'بيع'}</span>
              <span class="oc-fill-name">${ocEsc(OcPortfolio.label(f.coin))}</span>
            </div>
            <div class="oc-fill-sub">
              <span>${ocFmt(sz, 2)} سهم · ${ocPct(px, 1)}</span>
              <span>${ocUsd(px * sz)}</span>
              <span>${ocDateAr(new Date(f.time))}</span>
            </div>
          </div>`;
        }).join('')
      : '<div class="oc-empty">لا يوجد سجل تداول على أسواق التوقعات بعد</div>';
  } catch (e) {
    list.innerHTML = `<div class="oc-empty">⚠️ ${ocEsc(errToAr(e.message))}</div>`;
  }
}
