public with sharing class AudioRecorderController {
	@AuraEnabled
	public static AgentResponse getAgentResponse(String input) {
		AgentResponse response = new AgentResponse('Hello, world!', null);
		return response;
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
