public with sharing class UtterSenseKnowledgeRecController {
	// Wrapper class to handle the response
	public class KnowledgeRecommendationResponse {
		@AuraEnabled
		public String responseText { get; set; }
		@AuraEnabled
		public List<String> errors { get; set; }
		@AuraEnabled
		public Boolean isSuccess { get; set; }

		public KnowledgeRecommendationResponse() {
			this.errors = new List<String>();
			this.isSuccess = true;
		}
	}

	@AuraEnabled
	public static KnowledgeRecommendationResponse getRecommendedResponse(
		String searchString
	) {
		KnowledgeRecommendationResponse response = new KnowledgeRecommendationResponse();

		try {
			System.debug('Search string received: ' + searchString);

			// First, query Knowledge articles
			List<Knowledge__kav> articles = [
				SELECT Id, Title, Summary, UrlName, ArticleNumber
				FROM Knowledge__kav
				WITH SECURITY_ENFORCED
				LIMIT 5
			];

			// Format knowledge articles for the prompt
			String knowledgeSection = '';
			for (Knowledge__kav article : articles) {
				knowledgeSection += '\nArticle ID: ' + article.Id;
				knowledgeSection += '\nTitle: ' + article.Title;
				knowledgeSection += '\nContent: ' + article.Summary;
				knowledgeSection += '\n---\n';
			}

			// Create inputs
			ConnectApi.WrappedValue searchStringPropValue = new ConnectApi.WrappedValue();
			searchStringPropValue.value = searchString;
			ConnectApi.WrappedValue knowledgePropValue = new ConnectApi.WrappedValue();
			knowledgePropValue.value = knowledgeSection;

			Map<String, ConnectApi.WrappedValue> inputParams = new Map<String, ConnectApi.WrappedValue>();
			inputParams.put('Input:searchText', searchStringPropValue);
			inputParams.put('Input:knowledge', knowledgePropValue);

			System.debug('Input search text: ' + searchString);
			System.debug('Knowledge articles found: ' + articles.size());

			// Configure invocation parameters
			ConnectApi.EinsteinPromptTemplateGenerationsInput executeTemplateInput = new ConnectApi.EinsteinPromptTemplateGenerationsInput();
			executeTemplateInput.additionalConfig = new ConnectApi.EinsteinLlmAdditionalConfigInput();
			executeTemplateInput.additionalConfig.applicationName = 'PromptBuilderPreview';
			executeTemplateInput.isPreview = false;
			executeTemplateInput.inputParams = inputParams;

			// Call the service
			ConnectApi.EinsteinPromptTemplateGenerationsRepresentation generationsOutput = ConnectApi.EinsteinLLM.generateMessagesForPromptTemplate(
				'Utter_Sense_FAQ_2',
				executeTemplateInput
			);

			// Handle generation errors if any
			if (
				generationsOutput.generationErrors != null &&
				!generationsOutput.generationErrors.isEmpty()
			) {
				response.isSuccess = false;
				for (
					ConnectApi.EinsteinPromptTemplateGenerationsError error : generationsOutput.generationErrors
				) {
					String errorMsg = error.errorMessage;
					System.debug('Generation error: ' + errorMsg);
					response.errors.add(errorMsg);
				}
				return response;
			}

			// Handle successful generation
			if (
				generationsOutput.generations != null &&
				!generationsOutput.generations.isEmpty()
			) {
				ConnectApi.EinsteinLLMGenerationItemOutput generationResponse = generationsOutput.generations[0];
				response.responseText = generationResponse.text;
				System.debug('Generated response: ' + response.responseText);
			} else {
				System.debug('No generations found in the response');
				response.isSuccess = false;
				response.errors.add('No response generated from the model.');
			}
		} catch (Exception e) {
			System.debug(LoggingLevel.ERROR, 'Exception caught: ' + e.getMessage());
			System.debug(
				LoggingLevel.ERROR,
				'Stack trace: ' + e.getStackTraceString()
			);
			response.isSuccess = false;
			response.errors.add('Error: ' + e.getMessage());
		}

		return response;
	}
}
