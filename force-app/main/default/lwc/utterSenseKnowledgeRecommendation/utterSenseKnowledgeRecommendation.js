import { LightningElement, track } from "lwc";
import getKnowledgeArticles from "@salesforce/apex/UtterSenseKnowledgeRecController.getKnowledgeArticles";
import EINSTEIN_LOGO from "@salesforce/resourceUrl/UtterSenseEinsteinLogo";

export default class UtterSenseKnowledgeRecommendation extends LightningElement {
	@track recommendedArticles;
	@track isLoading = false;
	@track searchTerm = "";
	einsteinLogoUrl = EINSTEIN_LOGO;

	// New properties for placeholder handling
	get showPlaceholder() {
		return !this.isLoading && !this.searchTerm && !this.recommendedArticles;
	}

	get noArticlesFound() {
		return (
			!this.isLoading &&
			this.searchTerm &&
			(!this.recommendedArticles || this.recommendedArticles.length === 0)
		);
	}

	// Handle search input changes
	handleSearchChange(event) {
		const searchTerm = event.target.value;
		this.searchTerm = searchTerm;

		// If search term is empty, clear results
		if (!searchTerm) {
			this.recommendedArticles = null;
			return;
		}

		// Debounce the search to avoid too many API calls
		this.debounceSearch(searchTerm);
	}

	// Debounce helper
	debounceSearch(searchTerm) {
		// Clear any existing timeout
		if (this.delayTimeout) {
			clearTimeout(this.delayTimeout);
		}

		// Set a new timeout
		// eslint-disable-next-line @lwc/lwc/no-async-operation
		this.delayTimeout = setTimeout(() => {
			this.searchArticles(searchTerm);
		}, 300); // Wait 300ms after last keystroke before searching
	}

	// Search articles using the Apex controller
	async searchArticles(searchTerm) {
		this.isLoading = true;
		try {
			const results = await getKnowledgeArticles({ searchTerm });
			this.recommendedArticles = results;
		} catch (error) {
			console.error("Error searching articles:", error);
			this.recommendedArticles = null;
		} finally {
			this.isLoading = false;
		}
	}

	// Clean up when component is removed
	disconnectedCallback() {
		if (this.delayTimeout) {
			clearTimeout(this.delayTimeout);
		}
	}
}
