export class Agent {
    constructor() {
        this.config = null;
    }

    loadFromURL() {
        const params = new URLSearchParams(window.location.search);
        const link = params.get("link");

        if (!link) return null;

        try {
            const decoded = JSON.parse(atob(link));

            // لا يوجد مفاتيح هنا
            this.config = {
                main: decoded.main,
                agent_id: decoded.agent_id
            };

            console.log("Agent loaded:", this.config);
            return this.config;

        } catch (e) {
            console.error("Invalid link");
            return null;
        }
    }

    getConfig() {
        return this.config;
    }
}
