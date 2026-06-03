(function () {

    // 1) قراءة الرابط
    function getLinkData() {
        const params = new URLSearchParams(window.location.search);
        const link = params.get("link");

        if (!link) return null;

        try {
            const decoded = atob(link);
            return JSON.parse(decoded);
        } catch (e) {
            console.error("Invalid Base64 link");
            return null;
        }
    }

    // 2) تحميل config
    const data = getLinkData();

    if (!data) {
        console.warn("No agent link found. Running in normal mode.");
        window.HL_AGENT = null;
        return;
    }

    // 3) شكل البيانات المتوقع
    // {
    //   main: "0x...",
    //   agent: {
    //      name: "agent1",
    //      address: "0x...",
    //      key: "0xPRIVATE_KEY"
    //   }
    // }

    if (!data.agent || !data.agent.key) {
        console.error("Invalid agent structure");
        return;
    }

    // 4) حفظ محلي (جلسة)
    window.HL_AGENT = data;

    try {
        sessionStorage.setItem("hl_agent", JSON.stringify(data));
    } catch (e) {}

    console.log("Agent loaded successfully:", {
        main: data.main,
        agent: data.agent.name || "unknown"
    });

    // 5) Hook للتداول (يستخدمه trading.js)
    window.sendOrder = async function(order) {

        if (!window.HL_AGENT) {
            throw new Error("No agent loaded");
        }

        const payload = {
            main: window.HL_AGENT.main,
            agent: window.HL_AGENT.agent.name,
            order: order
        };

        return fetch("/api/trade", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });
    };

})();
