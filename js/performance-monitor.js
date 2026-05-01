/**
 * Performance Monitoring System
 * مراقبة أداء التطبيق وتسجيل المقاييس
 */

class PerformanceMonitor {
  constructor() {
    this.metrics = {};
    this.startTime = Date.now();
    this.initMonitoring();
  }

  // ✅ قياس أداء التحميل
  async measureLoadPerformance() {
    window.addEventListener('load', () => {
      const perfData = performance.getEntriesByType('navigation')[0];
      if (!perfData) return;

      const metrics = {
        dns: perfData.domainLookupEnd - perfData.domainLookupStart,
        tcp: perfData.connectEnd - perfData.connectStart,
        ttfb: perfData.responseStart - perfData.requestStart,
        domReady: perfData.domInteractive - perfData.fetchStart,
        pageLoad: perfData.loadEventEnd - perfData.fetchStart,
        resourceSize: this.calculateResourceSize()
      };

      this.metrics.load = metrics;
      this.logMetrics('📊 Load Performance', metrics);
    });
  }

  // ✅ حساب حجم الموارد
  calculateResourceSize() {
    const resources = performance.getEntriesByType('resource');
    let totalSize = 0;

    resources.forEach(resource => {
      if (resource.transferSize) {
        totalSize += resource.transferSize;
      }
    });

    return (totalSize / 1024).toFixed(2) + ' KB';
  }

  // ✅ قياس FPS
  measureFPS() {
    let frameCount = 0;
    let lastTime = performance.now();

    const countFrames = () => {
      frameCount++;
      const currentTime = performance.now();

      if (currentTime >= lastTime + 1000) {
        const fps = Math.round((frameCount * 1000) / (currentTime - lastTime));
        this.metrics.fps = fps;

        // تحذير إذا انخفض FPS
        if (fps < 30) {
          console.warn(`⚠️ FPS منخفض: ${fps}`);
        }

        frameCount = 0;
        lastTime = currentTime;
      }

      requestAnimationFrame(countFrames);
    };

    requestAnimationFrame(countFrames);
  }

  // ✅ قياس استخدام الذاكرة (إذا كان متاحاً)
  async measureMemory() {
    if (performance.memory) {
      setInterval(() => {
        const memory = {
          usedJSHeapSize: (performance.memory.usedJSHeapSize / 1048576).toFixed(2) + ' MB',
          totalJSHeapSize: (performance.memory.totalJSHeapSize / 1048576).toFixed(2) + ' MB',
          jsHeapSizeLimit: (performance.memory.jsHeapSizeLimit / 1048576).toFixed(2) + ' MB'
        };

        this.metrics.memory = memory;

        // تحذير إذا تجاوز استخدام الذاكرة 100 MB
        const used = parseFloat(memory.usedJSHeapSize);
        if (used > 100) {
          console.warn(`⚠️ استخدام ذاكرة عالي: ${memory.usedJSHeapSize}`);
        }
      }, 5000);
    }
  }

  // ✅ مراقبة النشاط على الشاشة
  measureCoreWebVitals() {
    // LCP - Largest Contentful Paint
    try {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1];
        this.metrics.lcp = lastEntry.renderTime || lastEntry.loadTime;
      });
      observer.observe({ entryTypes: ['largest-contentful-paint'] });
    } catch (e) {
      console.warn('⚠️ LCP غير مدعوم');
    }

    // FID - First Input Delay
    try {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach(entry => {
          this.metrics.fid = entry.processingDuration;
        });
      });
      observer.observe({ entryTypes: ['first-input'] });
    } catch (e) {
      console.warn('⚠️ FID غير مدعوم');
    }

    // CLS - Cumulative Layout Shift
    try {
      const observer = new PerformanceObserver((list) => {
        let clsValue = 0;
        list.getEntries().forEach(entry => {
          if (!entry.hadRecentInput) {
            clsValue += entry.value;
          }
        });
        this.metrics.cls = clsValue;
      });
      observer.observe({ entryTypes: ['layout-shift'] });
    } catch (e) {
      console.warn('⚠️ CLS غير مدعوم');
    }
  }

  // ✅ تسجيل المقاييس
  logMetrics(label, metrics) {
    console.group(label);
    Object.entries(metrics).forEach(([key, value]) => {
      console.log(`  ${key}: ${value}`);
    });
    console.groupEnd();
  }

  // ✅ تهيئة المراقبة
  initMonitoring() {
    this.measureLoadPerformance();
    this.measureFPS();
    this.measureMemory();
    this.measureCoreWebVitals();

    // طباعة تقرير كل 10 ثوان
    setInterval(() => {
      console.log('📈 Performance Report:', this.metrics);
    }, 10000);
  }

  // ✅ الحصول على التقرير
  getReport() {
    return {
      ...this.metrics,
      uptime: Date.now() - this.startTime
    };
  }
}

// تفعيل مراقبة الأداء
const performanceMonitor = new PerformanceMonitor();

window.PerformanceMonitor = performanceMonitor;
