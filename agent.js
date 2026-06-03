(function () {

    function decodeLink() {
        const params = new URLSearchParams(window.location.search);
        const link = params.get("link");

        if (!link) return null;

        try {
            const jsonStr = atob(link);
            return JSON.parse(jsonStr);
        } catch (e) {
            console.error("Invalid link format");
            return null;
        }
    }

    const config = decodeLink();

    if (!config) {
        console.warn("No agent config found in URL");
        return;
    }

    // تخزين محلي (اختياري)
    localStorage.setItem("hl_agent_config", JSON.stringify(config));

    // جعلها متاحة عالميًا لباقي المشروع
    window.HL_AGENT = config;

    console.log("Agent loaded:", config);

})();
