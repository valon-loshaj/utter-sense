public with sharing class WhisperController {
	@AuraEnabled
	public static String transcribeAudio(String audioBase64) {
		System.debug('=== Starting Whisper Transcription Process ===');

		try {
			// Log input validation
			if (String.isBlank(audioBase64)) {
				System.debug('Audio data is null or empty');
				throw new AuraHandledException('No audio data provided');
			}
			System.debug(
				'Audio data received. Base64 length: ' + audioBase64.length()
			);

			// Get the API key
			String apiKey = getOpenAIKey();
			System.debug('Successfully retrieved OpenAI API key');

			// Prepare the HTTP request
			HttpRequest req = new HttpRequest();
			req.setEndpoint('https://api.openai.com/v1/audio/transcriptions');
			req.setMethod('POST');
			req.setTimeout(120000); // Set timeout to 120 seconds for large audio files

			// Set required headers
			req.setHeader('Authorization', 'Bearer ' + apiKey);
			String boundary = String.valueOf(System.currentTimeMillis());
			req.setHeader(
				'Content-Type',
				'multipart/form-data; boundary=' + boundary
			);

			// Construct the multipart form body with all available options
			String body = constructMultipartFormBody(boundary, audioBase64);
			req.setBody(body);

			// Log request details (excluding sensitive data)
			System.debug('=== Request Details ===');
			System.debug('Endpoint: ' + req.getEndpoint());
			System.debug('Method: ' + req.getMethod());
			System.debug('Content-Type: ' + req.getHeader('Content-Type'));
			System.debug('Body length: ' + body.length());

			// Send the request
			System.debug('Sending request to OpenAI API...');
			Http http = new Http();
			HttpResponse res = http.send(req);

			// Log response details
			System.debug('=== Response Details ===');
			System.debug('Status Code: ' + res.getStatusCode());
			System.debug('Status: ' + res.getStatus());

			// Handle the response
			if (res.getStatusCode() == 200) {
				Map<String, Object> responseMap = (Map<String, Object>) JSON.deserializeUntyped(
					res.getBody()
				);
				String transcription = (String) responseMap.get('text');
				System.debug(
					'Transcription successful. Text length: ' +
					(transcription != null ? transcription.length() : 0)
				);
				return transcription;
			} else {
				String errorBody = res.getBody();
				System.debug('API Error Status Code: ' + res.getStatusCode());
				System.debug('API Error Status: ' + res.getStatus());
				System.debug('API Error Response Body: ' + errorBody);

				// Try to parse error response for more details
				try {
					Map<String, Object> errorMap = (Map<String, Object>) JSON.deserializeUntyped(
						errorBody
					);
					System.debug('Parsed Error Details: ' + errorMap);
				} catch (Exception e) {
					System.debug('Could not parse error response: ' + e.getMessage());
				}

				throw new AuraHandledException(
					'Failed to transcribe audio. Status: ' +
						res.getStatusCode() +
						', Response: ' +
						errorBody
				);
			}
		} catch (Exception e) {
			System.debug('=== Error Details ===');
			System.debug('Error Type: ' + e.getTypeName());
			System.debug('Error Message: ' + e.getMessage());
			System.debug('Stack Trace: ' + e.getStackTraceString());
			throw new AuraHandledException(
				'Error transcribing audio: ' + e.getMessage()
			);
		} finally {
			System.debug('=== Ending Whisper Transcription Process ===');
		}
	}

	private static String getOpenAIKey() {
		System.debug('Retrieving OpenAI API key from custom settings');
		OpenAI_Settings__c settings = OpenAI_Settings__c.getInstance();

		if (settings != null && String.isNotBlank(settings.API_Key__c)) {
			return settings.API_Key__c;
		}

		System.debug('OpenAI API key not found in custom settings');
		throw new AuraHandledException('OpenAI API key not configured');
	}

	private static String constructMultipartFormBody(
		String boundary,
		String audioBase64
	) {
		System.debug('Constructing multipart form body');

		String body = '';

		// Add file part
		body += '--' + boundary + '\r\n';
		body += 'Content-Disposition: form-data; name="file"; filename="audio.mp3"\r\n';
		body += 'Content-Type: audio/mpeg\r\n\r\n';
		body += audioBase64 + '\r\n';

		// Add model (required)
		body += '--' + boundary + '\r\n';
		body += 'Content-Disposition: form-data; name="model"\r\n\r\n';
		body += 'whisper-1\r\n';

		// Close the multipart form
		body += '--' + boundary + '--';

		System.debug('Multipart form body structure:');
		System.debug('1. File part with audio/mpeg content type');
		System.debug('2. Model part with value: whisper-1');
		System.debug('Total body length: ' + body.length());

		return body;
	}
}
