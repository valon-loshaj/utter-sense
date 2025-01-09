import { LightningElement, track } from "lwc";
import getRecommendedResponse from "@salesforce/apex/UtterSenseKnowledgeRecController.getRecommendedResponse";
import EINSTEIN_LOGO from "@salesforce/resourceUrl/UtterSenseEinsteinLogo";

export default class UtterSenseKnowledgeRecommendation extends LightningElement {
	@track response;
	@track isLoading = false;
	@track searchTerm = "";
	@track error;
	einsteinLogoUrl = EINSTEIN_LOGO;

	// New properties for placeholder handling
	get showPlaceholder() {
		return !this.isLoading && !this.searchTerm && !this.response;
	}

	get noResponseReceived() {
		return (
			!this.isLoading &&
			this.searchTerm &&
			(!this.response || !this.response.promptResponse)
		);
	}

	get formattedResponse() {
		if (!this.response || !this.response.promptResponse) {
			return null;
		}
		// Convert response text to HTML with line breaks
		return this.response.promptResponse
			.split("\n")
			.map((line) => {
				// You might want to add additional formatting here
				return line.trim();
			})
			.filter((line) => line.length > 0);
	}

	// Handle search input changes
	handleSearchChange(event) {
		const searchTerm = event.target.value;
		this.searchTerm = searchTerm;
		this.error = null;

		// If search term is empty, clear results
		if (!searchTerm) {
			this.response = null;
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
		this.error = null;

		try {
			const result = await getRecommendedResponse({ searchString: searchTerm });
			this.response = result;

			if (!result || !result.promptResponse) {
				throw new Error("No response received from the prompt template");
			}
		} catch (error) {
			console.error("Error getting response:", error);
			this.error = error.message || "An unexpected error occurred";
			this.response = null;
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
