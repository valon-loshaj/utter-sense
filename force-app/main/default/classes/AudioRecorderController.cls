public with sharing class AudioRecorderController {
	@AuraEnabled
	public static AgentResponse getAgentResponse(String input) {
		try {
			System.debug('getAgentResponse - Input received: ' + input);

			if (String.isBlank(input)) {
				System.debug('getAgentResponse - Input is blank or null');
				return new AgentResponse(null, 'Input text cannot be blank');
			}

			try {
				// Create inputs that are needed for the prompt template to be resolved
				ConnectApi.WrappedValue searchText = new ConnectApi.WrappedValue();
				searchText.value = input;
				Map<String, ConnectApi.WrappedValue> inputParams = new Map<String, ConnectApi.WrappedValue>();
				inputParams.put('Input:searchText', searchText);

				System.debug(
					'getAgentResponse - Input params prepared: ' + inputParams
				);

				ConnectApi.EinsteinPromptTemplateGenerationsInput executeTemplateInput = new ConnectApi.EinsteinPromptTemplateGenerationsInput();
				executeTemplateInput.additionalConfig = new ConnectApi.EinsteinLlmAdditionalConfigInput();
				executeTemplateInput.additionalConfig.applicationName = 'PromptBuilderPreview';
				executeTemplateInput.additionalConfig.numGenerations = 1;
				executeTemplateInput.isPreview = false;
				executeTemplateInput.inputParams = inputParams;

				System.debug(
					'getAgentResponse - Template input prepared: ' + executeTemplateInput
				);

				// Generate the agent response
				ConnectApi.EinsteinPromptTemplateGenerationsRepresentation generationsOutput = ConnectApi.EinsteinLLM.generateMessagesForPromptTemplate(
					'Utter_Sense_FAQ',
					executeTemplateInput
				);

				System.debug(
					'getAgentResponse - Raw Einstein response received: ' +
					generationsOutput
				);

				if (
					generationsOutput.generations == null ||
					generationsOutput.generations.isEmpty()
				) {
					System.debug(
						LoggingLevel.ERROR,
						'getAgentResponse - No generations returned from Einstein'
					);
					return new AgentResponse(null, 'No response generated from AI model');
				}

				// Handle the response
				ConnectApi.EinsteinLLMGenerationItemOutput einsteinResponse = generationsOutput.generations[0];
				String textResponse = einsteinResponse.text;

				System.debug('getAgentResponse - Final text response: ' + textResponse);

				// Return the response
				return new AgentResponse(textResponse, null);
			} catch (ConnectApi.ConnectApiException e) {
				System.debug(
					LoggingLevel.ERROR,
					'getAgentResponse - Einstein API Error: ' +
						e.getMessage() +
						'\nStack trace: ' +
						e.getStackTraceString()
				);
				return new AgentResponse(null, 'Einstein API Error: ' + e.getMessage());
			}
		} catch (Exception e) {
			System.debug(
				'getAgentResponse - Unexpected error: ' +
					e.getMessage() +
					'\nStack trace: ' +
					e.getStackTraceString()
			);
			throw new AuraHandledException(
				'An unexpected error occurred: ' + e.getMessage()
			);
		}
	}

	@AuraEnabled
	public static WhisperService.TranscriptionResponse transcribeAudio(
		String audioBase64
	) {
		try {
			System.debug(
				'transcribeAudio - Starting transcription. Audio length: ' +
				(audioBase64 != null ? audioBase64.length() : 0)
			);
			WhisperService.TranscriptionResponse response = WhisperService.transcribeAudio(
				audioBase64
			);
			System.debug(
				'transcribeAudio - Transcription completed successfully: ' + response
			);
			return response;
		} catch (Exception e) {
			System.debug(
				'transcribeAudio - Error occurred: ' +
					e.getMessage() +
					'\nStack trace: ' +
					e.getStackTraceString()
			);
			throw new AuraHandledException(e.getMessage());
		}
	}

	@AuraEnabled
	public static WhisperService.TranscriptionResponse generateAudio(
		String input
	) {
		try {
			System.debug(
				'generateAudio - Starting audio generation with input: ' + input
			);
			WhisperService.TranscriptionResponse response = WhisperService.generateAudio(
				input
			);
			System.debug(
				'generateAudio - Audio generation completed successfully: ' + response
			);
			return response;
		} catch (Exception e) {
			System.debug(
				'generateAudio - Error occurred: ' +
					e.getMessage() +
					'\nStack trace: ' +
					e.getStackTraceString()
			);
			throw new AuraHandledException(e.getMessage());
		}
	}

	public class AgentResponse {
		@AuraEnabled
		public String message;

		@AuraEnabled
		public String error;

		public AgentResponse(String message, String error) {
			this.message = message;
			this.error = error;
			System.debug(
				'AgentResponse - Created new response. Message: ' +
					message +
					', Error: ' +
					error
			);
		}
	}

	@AuraEnabled
	public static Map<String, Object> createConversation() {
		try {
			AgentMessagingService.MessagingResponse response = AgentMessagingService.createConversation();
			if (response.error != null) {
				throw new AuraHandledException(response.error);
			}
			return new Map<String, Object>{
				'conversationId' => response.conversationId,
				'messageId' => response.messageId
			};
		} catch (Exception e) {
			throw new AuraHandledException(e.getMessage());
		}
	}

	@AuraEnabled
	public static Map<String, Object> sendMessage(String conversationId, String message, String replyToMessageId) {
		try {
			if (String.isBlank(conversationId)) {
				throw new AuraHandledException('Conversation ID is required');
			}
			
			AgentMessagingService.MessagingResponse response = AgentMessagingService.sendMessage(conversationId, message, replyToMessageId);
			if (response.error != null) {
				throw new AuraHandledException(response.error);
			}
			return new Map<String, Object>{
				'messageId' => response.messageId,
				'text' => response.text
			};
		} catch (Exception e) {
			throw new AuraHandledException(e.getMessage());
		}
	}

	@AuraEnabled
	public static Map<String, Object> getAccessToken() {
		try {
			AgentMessagingService.MessagingResponse response = AgentMessagingService.getAccessToken();
			if (response.error != null) {
				throw new AuraHandledException(response.error);
			}
			return new Map<String, Object>{
				'accessToken' => response.accessToken,
				'tokenType' => response.tokenType,
				'tokenExpiry' => response.tokenExpiry
			};
		} catch (Exception e) {
			throw new AuraHandledException(e.getMessage());
		}
	}
}
