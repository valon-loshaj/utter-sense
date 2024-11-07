import { LightningElement, track } from "lwc";
import getKnowledgeArticles from "@salesforce/apex/UtterSenseKnowledgeRecController.getKnowledgeArticles";

export default class UtterSenseKnowledgeRecommendation extends LightningElement {
	@track recommendedArticles = [];
	@track isLoading = false; // Loading state
	searchString = "Tesla"; // Default search string

	connectedCallback() {
		this.fetchKnowledgeArticles();
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
