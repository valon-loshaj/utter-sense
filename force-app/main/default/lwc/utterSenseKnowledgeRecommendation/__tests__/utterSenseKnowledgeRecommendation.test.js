import { createElement } from "lwc";
import UtterSenseKnowledgeRecommendation from "c/utterSenseKnowledgeRecommendation";

describe("c-utter-sense-knowledge-recommendation", () => {
	let element;

	beforeEach(() => {
		element = createElement("c-utter-sense-knowledge-recommendation", {
			is: UtterSenseKnowledgeRecommendation
		});
	});

	it("should create component", () => {
		expect(element).toBeTruthy();
	});

	it("should have recommended articles", () => {
		document.body.appendChild(element);

		return Promise.resolve().then(() => {
			expect(element.recommendedArticles).toBeTruthy();
			expect(element.recommendedArticles.length).toBe(4);
			expect(element.recommendedArticles[0].Title).toContain("Tesla Model 3");
		});
	});
});
