import { LightningElement, api } from "lwc";

export default class UtterSenseKnowledgeArticle extends LightningElement {
	@api article;

	get articleUrl() {
		return `/lightning/r/Knowledge__kav/${this.article.Id}/view`;
	}
}
