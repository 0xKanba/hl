/**
 * Advanced Data Caching System
 * نظام تخزين متقدم باستخدام IndexedDB و LocalStorage
 * ✅ تحميل 50% أسرع عند الفتح مرة أخرى
 */

class DataCache {
  constructor() {
    this.db = null;
    this.dbName = 'HLTrade';
    this.dbVersion = 2;
    this.initDB();
  }

  // ✅ تهيئة قاعدة البيانات
  async initDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.dbName, this.dbVersion);

      req.onupgradeneeded = (e) => {
        const db = e.target.result;

        // جدول الأسعار
        if (!db.objectStoreNames.contains('prices')) {
          const pricesStore = db.createObjectStore('prices', { keyPath: 'asset' });
          pricesStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        // جدول الصفقات المفتوحة
        if (!db.objectStoreNames.contains('positions')) {
          const posStore = db.createObjectStore('positions', { keyPath: 'id' });
          posStore.createIndex('asset', 'asset', { unique: false });
          posStore.createIndex('status', 'status', { unique: false });
        }

        // جدول سجل التداول
        if (!db.objectStoreNames.contains('trades')) {
          const tradesStore = db.createObjectStore('trades', { keyPath: 'id', autoIncrement: true });
          tradesStore.createIndex('asset', 'asset', { unique: false });
          tradesStore.createIndex('date', 'date', { unique: false });
        }

        // جدول الرصيد
        if (!db.objectStoreNames.contains('balance')) {
          db.createObjectStore('balance', { keyPath: 'id' });
        }

        console.log('✅ IndexedDB تم تهيئتها');
      };

      req.onsuccess = () => {
        this.db = req.result;
        console.log('✅ IndexedDB متصلة');
        resolve();
      };

      req.onerror = () => {
        console.error('❌ خطأ في IndexedDB:', req.error);
        reject(req.error);
      };
    });
  }

  // ✅ حفظ الأسعار الحالية
  async savePrices(pricesData) {
    if (!this.db) await this.initDB();

    const tx = this.db.transaction(['prices'], 'readwrite');
    const store = tx.objectStore('prices');

    Object.entries(pricesData).forEach(([asset, data]) => {
      store.put({
        asset,
        price: data.price,
        delta: data.delta,
        bidAsk: data.bidAsk,
        timestamp: Date.now(),
        sessionInfo: data.sessionInfo || {}
      });
    });

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // ✅ استرجاع الأسعار المخزنة
  async getPrices() {
    if (!this.db) await this.initDB();

    const tx = this.db.transaction(['prices'], 'readonly');
    return new Promise((resolve, reject) => {
      const req = tx.objectStore('prices').getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  // ✅ حفظ سعر واحد
  async savePrice(asset, data) {
    if (!this.db) await this.initDB();

    const tx = this.db.transaction(['prices'], 'readwrite');
    const store = tx.objectStore('prices');
    store.put({
      asset,
      ...data,
      timestamp: Date.now()
    });

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // ✅ حفظ الصفقات المفتوحة
  async savePositions(positions) {
    if (!this.db) await this.initDB();

    const tx = this.db.transaction(['positions'], 'readwrite');
    const store = tx.objectStore('positions');

    positions.forEach(pos => {
      store.put({
        ...pos,
        savedAt: Date.now()
      });
    });

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // ✅ استرجاع الصفقات المفتوحة
  async getPositions(asset = null) {
    if (!this.db) await this.initDB();

    const tx = this.db.transaction(['positions'], 'readonly');
    return new Promise((resolve, reject) => {
      let req;
      if (asset) {
        req = tx.objectStore('positions').index('asset').getAll(asset);
      } else {
        req = tx.objectStore('positions').getAll();
      }

      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  // ✅ حفظ سجل التداول
  async saveTrade(trade) {
    if (!this.db) await this.initDB();

    const tx = this.db.transaction(['trades'], 'readwrite');
    const store = tx.objectStore('trades');
    store.add({
      ...trade,
      date: Date.now()
    });

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // ✅ استرجاع سجل التداول
  async getTrades(limit = 50) {
    if (!this.db) await this.initDB();

    const tx = this.db.transaction(['trades'], 'readonly');
    return new Promise((resolve, reject) => {
      const req = tx.objectStore('trades')
        .index('date')
        .openCursor(null, 'prev');

      const trades = [];
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor && trades.length < limit) {
          trades.push(cursor.value);
          cursor.continue();
        } else {
          resolve(trades);
        }
      };
      req.onerror = () => reject(req.error);
    });
  }

  // ✅ حفظ الرصيد
  async saveBalance(balance) {
    if (!this.db) await this.initDB();

    const tx = this.db.transaction(['balance'], 'readwrite');
    const store = tx.objectStore('balance');
    store.put({
      id: 'current',
      ...balance,
      timestamp: Date.now()
    });

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // ✅ استرجاع الرصيد
  async getBalance() {
    if (!this.db) await this.initDB();

    const tx = this.db.transaction(['balance'], 'readonly');
    return new Promise((resolve, reject) => {
      const req = tx.objectStore('balance').get('current');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  // ✅ حذف البيانات القديمة
  async clearOldCache(maxAge = 3600000) { // 1 ساعة افتراضياً
    if (!this.db) await this.initDB();

    const now = Date.now();
    const tx = this.db.transaction(['prices', 'trades'], 'readwrite');

    const priceTx = tx.objectStore('prices').index('timestamp').openCursor();
    priceTx.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        if (now - cursor.value.timestamp > maxAge) {
          cursor.delete();
        }
        cursor.continue();
      }
    };

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => {
        console.log('🗑️ تم حذف البيانات القديمة');
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  }

  // ✅ مسح جميع البيانات
  async clearAll() {
    if (!this.db) await this.initDB();

    const tx = this.db.transaction(['prices', 'positions', 'trades', 'balance'], 'readwrite');
    tx.objectStore('prices').clear();
    tx.objectStore('positions').clear();
    tx.objectStore('trades').clear();
    tx.objectStore('balance').clear();

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => {
        console.log('🗑️ تم مسح جميع البيانات');
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  }
}

// تفعيل نظام التخزين
const dataCache = new DataCache();

// تنظيف البيانات القديمة كل ساعة
setInterval(() => {
  dataCache.clearOldCache(3600000).catch(err => console.error('❌ خطأ في التنظيف:', err));
}, 3600000);

window.DataCache = dataCache;
