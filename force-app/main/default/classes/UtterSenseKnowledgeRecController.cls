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
			System.debug('Error: ' + e.getMessage());
		}
		return wrapperData.generatedText;
	}

	public static ResponseWrapper preparePromptContent(String searchString) {
		Map<String, String> property = new Map<String, String>();
		property.put('query', searchString);
		ConnectApi.WrappedValue propertyValue = new ConnectApi.WrappedValue();
		propertyValue.value = property;
		Map<String, ConnectApi.WrappedValue> inputParams = new Map<String, ConnectApi.WrappedValue>();
		inputParams.put('Input:Query', propertyValue);

		ConnectApi.EinsteinPromptTemplateGenerationsInput executeTemplateInput = new ConnectApi.EinsteinPromptTemplateGenerationsInput();
		executeTemplateInput.additionalConfig = new ConnectApi.EinsteinLlmAdditionalConfigInput();
		executeTemplateInput.additionalConfig.applicationName = 'PromptBuilderPreview';
		executeTemplateInput.isPreview = false;
		executeTemplateInput.inputParams = inputParams;

		ConnectApi.EinsteinPromptTemplateGenerationsRepresentation generationsOutput = ConnectApi.EinsteinLLM.generateMessagesForPromptTemplate(
			'Utter_Sense_FAQ',
			executeTemplateInput
		);

		ConnectApi.EinsteinLLMGenerationItemOutput output = generationsOutput.generations[0];
		ResponseWrapper outputResponse = new ResponseWrapper();
		outputResponse.generatedText = output.text;
		return outputResponse;
	}

	public class ResponseWrapper {
		@AuraEnabled
		public String promptContent;
		@AuraEnabled
		public String generatedText;
	}
}
