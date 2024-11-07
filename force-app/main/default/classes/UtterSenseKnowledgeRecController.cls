public with sharing class UtterSenseKnowledgeRecController {
	@AuraEnabled(cacheable=true)
	public static List<Knowledge__kav> getKnowledgeArticles(String searchString) {
		// Query Knowledge articles based on the search string
		return [
			SELECT Id, Title, Summary__c
			FROM Knowledge__kav
			WHERE Title LIKE :('%' + searchString + '%')
			LIMIT 10
		];
	}
}
