public with sharing class UtterSenseKnowledgeRecController {
	@AuraEnabled
	public static List<Knowledge__kav> getKnowledgeArticles(String searchString) {
		try {
			if (String.isBlank(searchString)) {
				return new List<Knowledge__kav>();
			}

			// Escape special characters in search string
			searchString = String.escapeSingleQuotes(searchString);

			// Build SOSL query
			String searchQuery =
				'FIND :searchString IN ALL FIELDS RETURNING Knowledge__kav(' +
				'Id, Title, Summary, UrlName, ArticleNumber, LastPublishedDate ' +
				'WHERE PublishStatus = \'Online\' AND Language = \'en_US\' ' +
				'ORDER BY LastPublishedDate DESC LIMIT 5)';

			List<List<SObject>> searchResults = Search.query(searchQuery);

			if (!searchResults.isEmpty() && !searchResults[0].isEmpty()) {
				return (List<Knowledge__kav>) searchResults[0];
			}

			return new List<Knowledge__kav>();
		} catch (Exception e) {
			System.debug(
				LoggingLevel.ERROR,
				'Error in getKnowledgeArticles: ' + e.getMessage()
			);
			throw new AuraHandledException(
				'Error retrieving knowledge articles: ' + e.getMessage()
			);
		}
	}
}
