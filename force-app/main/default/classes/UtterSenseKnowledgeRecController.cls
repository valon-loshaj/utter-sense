public with sharing class UtterSenseKnowledgeRecController {
	@AuraEnabled
	public static String getRecommendedResponse(String searchString) {
		try {
			// Create generate text request
			aiplatform.ModelsAPI.createGenerations_Request request = new aiplatform.ModelsAPI.createGenerations_Request();

			// Specify model
			request.modelName = 'sfdc_ai__DefaultOpenAIGPT4OmniMini';

			// Create request body
			aiplatform.ModelsAPI_GenerationRequest requestBody = new aiplatform.ModelsAPI_GenerationRequest();
			request.body = requestBody;

			// Add prompt to body
			requestBody.prompt = 'Generate a welcome email for the new developer on the team, Jane Doe.';

			try {
				// Make request
				aiplatform.ModelsAPI modelsAPI = new aiplatform.ModelsAPI();
				aiplatform.ModelsAPI.createGenerations_Response response = modelsAPI.createGenerations(
					request
				);
				System.debug(
					'Models API response: ' + response.Code200.generation.generatedText
				);

				// Check if we got a valid response
				if (response != null) {
					// Return the generated text from the first generation
					return response;
				}

				throw new AuraHandledException('No response generated from the model');

				// Handle error
			} catch (aiplatform.ModelsAPI.createGenerations_ResponseException e) {
				System.debug('Response code: ' + e.responseCode);
				System.debug('The following exception occurred: ' + e);
			}
		}
	}
}
