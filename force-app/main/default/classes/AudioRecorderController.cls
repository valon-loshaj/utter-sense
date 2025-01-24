public with sharing class AudioRecorderController {
	@AuraEnabled
	public static AgentResponse getAgentResponse(String input) {
		AgentResponse response = new AgentResponse('Hello, world!', null);
		return response;
	}

	@AuraEnabled
	public static WhisperService.TranscriptionResponse transcribeAudio(
		String audioBase64
	) {
		try {
			return WhisperService.transcribeAudio(audioBase64);
		} catch (Exception e) {
			throw new AuraHandledException(e.getMessage());
		}
	}

	@AuraEnabled
	public static WhisperService.TranscriptionResponse generateAudio(
		String input
	) {
		try {
			return WhisperService.generateAudio(input);
		} catch (Exception e) {
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
		}
	}
}
