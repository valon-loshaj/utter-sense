import { LightningElement, track } from "lwc";
import getKnowledgeArticles from "@salesforce/apex/UtterSenseKnowledgeRecController.getKnowledgeArticles";

export default class UtterSenseKnowledgeRecommendation extends LightningElement {
	@track recommendedArticles = [];
	@track isLoading = false;
	searchString = "Tesla";

	connectedCallback() {
		this.subscribeToVoiceToolkit();
	}

	disconnectedCallback() {
		this.unsubscribeFromVoiceToolkit();
	}

	subscribeToVoiceToolkit() {
		const toolkitApi = this.template.querySelector(
			"lightning-service-cloud-voice-toolkit-api"
		);
		if (toolkitApi) {
			toolkitApi.addEventListener(
				"callstarted",
				this.handleCallStarted.bind(this)
			);
			toolkitApi.addEventListener(
				"transcript",
				this.handleTranscript.bind(this)
			);
			toolkitApi.addEventListener("callended", this.handleCallEnded.bind(this));
		}
	}

	unsubscribeFromVoiceToolkit() {
		const toolkitApi = this.template.querySelector(
			"lightning-service-cloud-voice-toolkit-api"
		);
		if (toolkitApi) {
			toolkitApi.removeEventListener(
				"callstarted",
				this.handleCallStarted.bind(this)
			);
			toolkitApi.removeEventListener(
				"transcript",
				this.handleTranscript.bind(this)
			);
			toolkitApi.removeEventListener(
				"callended",
				this.handleCallEnded.bind(this)
			);
		}
	}

	handleCallStarted(event) {
		console.log("Call started:", event.detail);
		this.isLoading = true;
	}

	handleTranscript(event) {
		if (event.detail && event.detail.text) {
			this.searchString = event.detail.text;
			this.fetchKnowledgeArticles();
		}
	}

	handleCallEnded(event) {
		console.log("Call ended:", event.detail);
		this.isLoading = false;
		this.recommendedArticles = [];
	}

	async fetchKnowledgeArticles() {
		this.isLoading = true;
		try {
			const result = await getKnowledgeArticles({
				searchString: this.searchString
			});
			this.recommendedArticles = result;
		} catch (error) {
			console.error("Error fetching knowledge articles:", error);
		} finally {
			this.isLoading = false;
		}
	}
}
