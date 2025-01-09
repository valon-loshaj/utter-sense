public with sharing class UtterSenseKnowledgeRecController {
	@AuraEnabled
	public static String getRecommendedResponse(String searchString) {
		aiplatform.ModelsAPI.createGenerations_Request request = new aiplatform.ModelsAPI.createGenerations_Request();

		// Specify model
		request.modelName = 'sfdc_ai__DefaultGPT4Omni';

		// Create request body
		aiplatform.ModelsAPI_GenerationRequest requestBody = new aiplatform.ModelsAPI_GenerationRequest();
		request.body = requestBody;
		System.debug('Value of request: ' + JSON.serializePretty(request));

		// Add prompt to body
		ResponseWrapper wrapperData = preparePromptContent(searchString);
		requestBody.prompt = wrapperData.promptContent;
		System.debug('Value of wrapperData: ' + JSON.serializePretty(wrapperData));
		try {
			// Make request
			aiplatform.ModelsAPI modelsAPI = new aiplatform.ModelsAPI();
			aiplatform.ModelsAPI.createGenerations_Response response = modelsAPI.createGenerations(
				request
			);
			wrapperData.generatedText = response.Code200.generation.generatedText;
			System.debug('Value of response: ' + JSON.serializePretty(response));
		} catch (aiplatform.ModelsAPI.createGenerations_ResponseException e) {
			ExceptionLog__c ex = new ExceptionLog__c(
				ExceptionDescription__c = e.getMessage()
			);
			insert ex;
		}
		return wrapperData.generatedText;
	}

	public static ResponseWrapper preparePromptContent(String searchString) {
		String promptContent = 'Utter_Sense_FAQ: ' + searchString;
		ResponseWrapper response = new ResponseWrapper();
		response.promptContent = promptContent;
		return response;
	}

	public class ResponseWrapper {
		@AuraEnabled
		public String promptContent;
		@AuraEnabled
		public String generatedText;
	}
}
