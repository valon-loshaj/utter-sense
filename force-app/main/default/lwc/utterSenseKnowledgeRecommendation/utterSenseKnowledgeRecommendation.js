import { LightningElement } from "lwc";

export default class UtterSenseKnowledgeRecommendation extends LightningElement {
	recommendedArticles = [
		{
			Id: "1",
			Title: "Tesla Model 3: Features and Specifications",
			Summary:
				"Comprehensive guide to Tesla Model 3 features including range (358 miles), acceleration (0-60 mph in 3.1s), and advanced autopilot capabilities. Learn about the all-electric sedan's interior features and charging options."
		},
		{
			Id: "2",
			Title: "Tesla Model Y: The Ultimate Electric SUV",
			Summary:
				"Detailed overview of Tesla Model Y, the compact SUV offering up to 330 miles of range. Discover its spacious interior, dual-motor AWD system, and advanced safety features."
		},
		{
			Id: "3",
			Title: "Tesla Model S Plaid: Breaking Speed Records",
			Summary:
				"Explore the groundbreaking performance of Tesla Model S Plaid, featuring tri-motor setup, 1,020 horsepower, and 0-60 mph in just 1.99 seconds. Learn about its revolutionary battery technology and luxury features."
		},
		{
			Id: "4",
			Title: "Tesla Cybertruck: The Future of Electric Trucks",
			Summary:
				"Everything you need to know about the upcoming Tesla Cybertruck, including its unique design, ultra-hard 30X cold-rolled stainless steel body, and impressive towing capacity of up to 14,000 pounds."
		}
	];
}
