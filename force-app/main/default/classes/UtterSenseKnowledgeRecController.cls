/**
 * @description Controller class for handling Knowledge Article recommendations using Einstein LLM
 * @group Knowledge Management
 */
public with sharing class UtterSenseKnowledgeRecController {
	/**
	 * @description Wrapper class to handle the response from the knowledge recommendation service
	 */
	public class KnowledgeRecommendationResponse {
		/**
		 * @description The AI-generated response text based on the knowledge articles
		 */
		@AuraEnabled
		public String responseText { get; set; }

		/**
		 * @description List of error messages if any occurred during processing
		 */
		@AuraEnabled
		public List<String> errors { get; set; }

		/**
		 * @description Indicates whether the recommendation process was successful
		 */
		@AuraEnabled
		public Boolean isSuccess { get; set; }

		/**
		 * @description Constructor to initialize the response object
		 */
		public KnowledgeRecommendationResponse() {
			this.errors = new List<String>();
			this.isSuccess = true;
		}
	}

	/**
	 * @description Gets recommended responses based on the search string using Knowledge articles and Einstein LLM
	 * @param searchString The text to search for relevant knowledge articles
	 * @return KnowledgeRecommendationResponse containing the AI-generated response and any errors
	 */
	@AuraEnabled
	public static KnowledgeRecommendationResponse getRecommendedResponse(
		String searchString
	) {
		KnowledgeRecommendationResponse response = new KnowledgeRecommendationResponse();
		LoggingLevel logLevel = LoggingLevel.DEBUG;

		try {
			Logger.debug(logLevel, 'Search string received: ' + searchString);

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

			Logger.debug(logLevel, 'Input search text: ' + searchString);
			Logger.debug(logLevel, 'Knowledge articles found: ' + articles.size());

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
					Logger.error('Generation error: ' + errorMsg);
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
				Logger.debug(logLevel, 'Generated response: ' + response.responseText);
			} else {
				Logger.warn('No generations found in the response');
				response.isSuccess = false;
				response.errors.add('No response generated from the model.');
			}
		} catch (Exception e) {
			Logger.error('Exception caught: ' + e.getMessage());
			Logger.error('Stack trace: ' + e.getStackTraceString());
			response.isSuccess = false;
			response.errors.add('Error: ' + e.getMessage());
		}

		return response;
	}
}
