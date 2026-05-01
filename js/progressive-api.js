/**
 * Progressive API Fetching System
 * جلب بيانات الأسعار بشكل تدريجي وذكي
 * ✅ بيانات حية بلا تأخير ملحوظ
 */

class ProgressiveAPI {
  constructor() {
    this.ws = null;
    this.priceBuffer = new Map();
    this.updateInterval = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 1000;
    this.isConnected = false;

    this.initWebSocket();
    this.startBufferedUpdates();
  }

  // ✅ تهيئة WebSocket
  initWebSocket() {
    try {
      this.ws = new WebSocket('wss://api.hyperliquid.xyz/ws');

      this.ws.onopen = () => {
        console.log('✅ WebSocket متصل');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.subscribeToAssets(['XAU', 'NQ', 'GOLD', 'SILVER', 'CL']);
      };

      this.ws.onmessage = (event) => {
        this.handlePriceUpdate(JSON.parse(event.data));
      };

      this.ws.onerror = (error) => {
        console.error('❌ خطأ WebSocket:', error);
        this.isConnected = false;
      };

      this.ws.onclose = () => {
        console.warn('⚠️ تم قطع WebSocket');
        this.isConnected = false;
        this.attemptReconnect();
      };
    } catch (err) {
      console.error('❌ فشل إنشاء WebSocket:', err);
      this.fallbackToREST();
    }
  }

  // ✅ إعادة الاتصال التلقائي
  attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('❌ فشل الاتصال بعد محاولات متعددة');
      this.fallbackToREST();
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    console.log(`⏳ محاولة إعادة الاتصال في ${delay}ms...`);

    setTimeout(() => {
      this.initWebSocket();
    }, delay);
  }

  // ✅ معالجة تحديث السعر
  handlePriceUpdate(data) {
    if (!data.asset || !data.price) return;

    this.priceBuffer.set(data.asset, {
      asset: data.asset,
      price: parseFloat(data.price),
      delta: parseFloat(data.delta || 0),
      bidAsk: data.bidAsk || '',
      sessionInfo: data.sessionInfo || {},
      timestamp: Date.now()
    });
  }

  // ✅ تجميع وتحديث الواجهة كل 100ms
  startBufferedUpdates() {
    this.updateInterval = setInterval(async () => {
      if (this.priceBuffer.size === 0) return;

      const updates = Object.fromEntries(this.priceBuffer);

      // حفظ في الكاش
      try {
        await dataCache.savePrices(updates);
      } catch (err) {
        console.error('❌ خطأ في حفظ الكاش:', err);
      }

      // تحديث الواجهة
      this.updateUI(updates);

      // مسح المخزن المؤقت
      this.priceBuffer.clear();
    }, 100);
  }

  // ✅ الاشتراك في الأصول
  subscribeToAssets(assets) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('⚠️ WebSocket غير متصل');
      return;
    }

    assets.forEach(asset => {
      this.ws.send(JSON.stringify({
        op: 'subscribe',
        data: { channel: 'allMids', asset }
      }));
    });
  }

  // ✅ تحديث الواجهة
  updateUI(priceUpdates) {
    Object.entries(priceUpdates).forEach(([asset, data]) => {
      this.updatePriceElement(asset, data);
      this.updateTabPrice(asset, data);
    });
  }

  // ✅ تحديث عنصر السعر في الكارت
  updatePriceElement(asset, data) {
    const priceEl = document.getElementById(`price${asset}`);
    if (!priceEl) return;

    priceEl.textContent = data.price.toFixed(2);
    priceEl.className = 'tab-price';
    priceEl.classList.add(data.delta >= 0 ? 'up' : 'dn');
  }

  // ✅ تحديث سعر التاب
  updateTabPrice(asset, data) {
    const tabEl = document.querySelector(`[data-asset="${asset}"] .tab-price`);
    if (!tabEl) return;

    tabEl.textContent = data.price.toFixed(2);
    tabEl.className = 'tab-price';
    tabEl.classList.add(data.delta >= 0 ? 'up' : 'dn');
  }

  // ✅ احتياطي: جلب بيانات من REST API
  async fallbackToREST() {
    console.warn('⚠️ تبديل إلى REST API');

    const assets = ['XAU', 'NQ', 'GOLD', 'SILVER', 'CL'];

    const fetchPricesSequentially = async () => {
      for (const asset of assets) {
        try {
          const res = await fetch(`https://api.hyperliquid.xyz/info?user=&type=meta`);
          const data = await res.json();

          // استخراج بيانات الأصل
          const assetData = data.find(a => a.name === asset);
          if (assetData) {
            const priceData = {
              asset,
              price: parseFloat(assetData.midPrice),
              delta: 0, // يمكن حسابها من البيانات السابقة
              bidAsk: `${assetData.bid}/${assetData.ask}`,
              timestamp: Date.now()
            };

            await dataCache.savePrice(asset, priceData);
            this.updateUI({ [asset]: priceData });
          }

          // تأخير 300ms بين الطلبات لتقليل الضغط
          await new Promise(r => setTimeout(r, 300));
        } catch (err) {
          console.error(`❌ فشل جلب سعر ${asset}:`, err);
        }
      }

      // إعادة محاولة كل 5 ثواني
      setTimeout(() => fetchPricesSequentially(), 5000);
    };

    fetchPricesSequentially();
  }

  // ✅ الحصول على آخر سعر مخزن
  async getLastPrice(asset) {
    const prices = await dataCache.getPrices();
    return prices.find(p => p.asset === asset);
  }

  // ✅ إيقاف الخدمة
  stop() {
    if (this.updateInterval) clearInterval(this.updateInterval);
    if (this.ws) this.ws.close();
    console.log('🛑 تم إيقاف ProgressiveAPI');
  }
}

// تفعيل الخدمة
const progressiveAPI = new ProgressiveAPI();

window.ProgressiveAPI = progressiveAPI;
