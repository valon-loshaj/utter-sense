public with sharing class UtterSenseKnowledgeRecController {
	@AuraEnabled
	public static String getRecommendedResponse(String searchString) {
		// Create inputs
		ConnectApi.WrappedValue searchStringPropValue = new ConnectApi.WrappedValue();
		searchStringPropValue.value = searchString;
		Map<String, ConnectApi.WrappedValue> inputParams = new Map<String, ConnectApi.WrappedValue>();
		inputParams.put('Input:Query', searchStringPropValue);
		inputParams.put('Input:RetrieverIdOrName', '');
		// Configure invocation parameters
		ConnectApi.EinsteinPromptTemplateGenerationsInput executeTemplateInput = new ConnectApi.EinsteinPromptTemplateGenerationsInput();
		executeTemplateInput.additionalConfig = new ConnectApi.EinsteinLlmAdditionalConfigInput();
		executeTemplateInput.additionalConfig.applicationName = 'PromptBuilderPreview';
		executeTemplateInput.isPreview = false;
		executeTemplateInput.inputParams = inputParams;

		System.debug('Execute Template Input: ' + executeTemplateInput);

		try {
			// Call the service
			ConnectApi.EinsteinPromptTemplateGenerationsRepresentation generationsOutput = ConnectApi.EinsteinLLM.generateMessagesForPromptTemplate(
				'Utter_Sense_FAQ',
				executeTemplateInput
			);

			System.debug('Citations: ' + generationsOutput.citations);
			System.debug('Generation Errors: ' + generationsOutput.generationErrors);
			System.debug('Generations: ' + generationsOutput.generations);
			System.debug('Prompt: ' + generationsOutput.prompt);
			System.debug(
				'Prompt Template Dev Name: ' + generationsOutput.promptTemplateDevName
			);
			ConnectApi.EinsteinLLMGenerationItemOutput response = generationsOutput.generations[0];
			return response.text;
		} catch (Exception e) {
			System.debug(e.getMessage());
			throw e;
		}
	}
}
