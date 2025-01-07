public with sharing class UtterSenseKnowledgeRecController {
	@AuraEnabled
	public static List<Knowledge__kav> getKnowledgeArticles(String searchString) {
		try {
			if (String.isBlank(searchString)) {
				return new List<Knowledge__kav>();
			}

			// Escape special characters in search string
			searchString = String.escapeSingleQuotes(searchString);

			// Build Data Cloud Query
			String dataCloudQuery =
				'SELECT Id, Title, Summary, UrlName, ArticleNumber, LastPublishedDate ' +
				'FROM ssot__KnowledgeArticle__dlm ' +
				'WHERE Title LIKE \'%' +
				searchString +
				'%\' ' +
				'OR Summary LIKE \'%' +
				searchString +
				'%\' ' +
				'AND PublishStatus = \'Online\' ' +
				'AND Language = \'en_US\' ' +
				'ORDER BY LastPublishedDate DESC ' +
				'LIMIT 5';

			// Make HTTP callout to Data Cloud Query API
			Http http = new Http();
			HttpRequest request = new HttpRequest();
			request.setEndpoint('callout:DataCloudAPI/api/v2/query');
			request.setMethod('POST');
			request.setHeader('Content-Type', 'application/json');

			// Construct the request body
			Map<String, Object> requestBody = new Map<String, Object>{
				'sql' => dataCloudQuery,
				'options' => new Map<String, Object>{ 'limit' => 5 }
			};

			request.setBody(JSON.serialize(requestBody));

			// Send the request
			HttpResponse response = http.send(request);

			if (response.getStatusCode() == 200) {
				// Parse the response and convert to Knowledge__kav records
				Map<String, Object> responseBody = (Map<String, Object>) JSON.deserializeUntyped(
					response.getBody()
				);
				List<Object> data = (List<Object>) responseBody.get('data');

				List<Knowledge__kav> articles = new List<Knowledge__kav>();
				for (Object record : data) {
					Map<String, Object> fields = (Map<String, Object>) record;
					Knowledge__kav article = new Knowledge__kav(
						Id = (String) fields.get('Id'),
						Title = (String) fields.get('Title'),
						Summary = (String) fields.get('Summary'),
						UrlName = (String) fields.get('UrlName')
					);
					articles.add(article);
				}
				return articles;
			}

			throw new AuraHandledException(
				'Error querying Data Cloud: ' +
					response.getStatusCode() +
					' ' +
					response.getStatus()
			);
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
