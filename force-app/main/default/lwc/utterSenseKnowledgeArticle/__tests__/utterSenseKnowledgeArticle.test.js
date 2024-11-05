import { createElement } from "lwc";
import UtterSenseKnowledgeArticle from "c/utterSenseKnowledgeArticle";

describe("c-utter-sense-knowledge-article", () => {
	let element;

	beforeEach(() => {
		element = createElement("c-utter-sense-knowledge-article", {
			is: UtterSenseKnowledgeArticle
		});
	});

	it("should create component", () => {
		expect(element).toBeTruthy();
	});

	it("should generate correct article URL", () => {
		const mockArticle = {
			Id: "testId123",
			Title: "Test Article",
			Summary: "Test Summary"
		};

		element.article = mockArticle;

		return Promise.resolve().then(() => {
			const expectedUrl = `/lightning/r/Knowledge__kav/${mockArticle.Id}/view`;
			expect(element.articleUrl).toBe(expectedUrl);
		});
	});
});
