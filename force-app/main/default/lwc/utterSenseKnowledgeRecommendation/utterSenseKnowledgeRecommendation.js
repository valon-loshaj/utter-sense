import { LightningElement, track } from "lwc";
import getKnowledgeArticles from "@salesforce/apex/UtterSenseKnowledgeRecController.getKnowledgeArticles";
import { getSCVToolkit } from "lightning/serviceSCV";

export default class UtterSenseKnowledgeRecommendation extends LightningElement {
	@track recommendedArticles = [];
	@track isLoading = false; // Loading state
	searchString = "Tesla"; // Default search string
	scvToolkit;

	connectedCallback() {
		this.initializeSCVToolkit();
	}

	initializeSCVToolkit() {
		getSCVToolkit()
			.then((scvToolkit) => {
				this.scvToolkit = scvToolkit;
				this.registerTelephonyEventListeners();
			})
			.catch((error) => {
				console.error("Error initializing SCV Toolkit:", error);
				this.fetchKnowledgeArticles(); // Fetch articles with the default searchString if there's an error
			});
	}

	registerTelephonyEventListeners() {
		if (this.scvToolkit) {
			this.scvToolkit.onTelephonyEvent((event) => {
				if (event && event.type === "utterance") {
					console.log("Utterance Event:", event);
					console.log("Utterance Text:", event.data.utterance);
					this.searchString = event.data.utterance || this.searchString; // Update searchString with the utterance
					this.fetchKnowledgeArticles();
				}
			});
		}
	}

	async fetchKnowledgeArticles() {
		this.isLoading = true; // Set loading state to true
		try {
			const result = await getKnowledgeArticles({
				searchString: this.searchString
			});
			this.recommendedArticles = result;
		} catch (error) {
			console.error("Error fetching knowledge articles:", error);
			this.recommendedArticles = [];
		} finally {
			this.isLoading = false; // Set loading state to false after fetching
		}
	}
}
