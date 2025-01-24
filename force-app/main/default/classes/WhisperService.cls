/**
 * @description Controller class for handling Whisper API transcription functionality
 * @author Your Name
 * @group Speech Recognition
 */
public with sharing class WhisperService {
	// TODO: Replace with Named Credentials once configured
	private static final String WHISPER_API_ENDPOINT = 'https://api.openai.com/v1/audio/transcriptions';
	private static final String BOUNDARY = '----WhisperFormBoundary7MA4YWxkTrZu0gW';
	private static final String EXTRA_BOUNDARY = '--' + BOUNDARY;

	/**
	 * @description Response wrapper class for Whisper API transcription and audio generation results
	 */
	public class TranscriptionResponse {
		@AuraEnabled
		public String text { get; set; }
		@AuraEnabled
		public String language { get; set; }
		@AuraEnabled
		public Double duration { get; set; }
		@AuraEnabled
		public String audioBase64 { get; set; }
	}

	/**
	 * @description Custom exception class for Whisper API related errors
	 */
	public class WhisperAPIException extends Exception {
	}

	/**
	 * @description Transcribes audio data using OpenAI's Whisper API
	 * @param audioBase64 Base64 encoded audio data to transcribe
	 * @return TranscriptionResponse containing the transcribed text and metadata
	 * @throws AuraHandledException if transcription fails
	 */
	@AuraEnabled
	public static TranscriptionResponse transcribeAudio(String audioBase64) {
		LoggingLevel logLevel = LoggingLevel.DEBUG;
		Logger.debug(logLevel, '=== Starting Whisper Transcription Process ===');

		try {
			// Input validation
			if (String.isBlank(audioBase64)) {
				throw new WhisperAPIException('No audio data provided');
			}

			// Get API key
			String apiKey = getOpenAIKey();

			// Convert base64 to blob
			Blob audioBlob = EncodingUtil.base64Decode(audioBase64);

			// Prepare metadata
			Map<String, String> metadataMap = new Map<String, String>{
				'model' => 'whisper-1'
			};

			// Create multipart form data
			Blob formDataBlob = createMultipartFormData(
				audioBlob,
				'audio/webm',
				'audio.webm',
				metadataMap
			);

			// Prepare HTTP request
			HttpRequest req = new HttpRequest();
			req.setEndpoint(WHISPER_API_ENDPOINT);
			req.setMethod('POST');
			req.setHeader('Authorization', 'Bearer ' + apiKey);
			req.setHeader(
				'Content-Type',
				'multipart/form-data; boundary=' + BOUNDARY
			);
			req.setTimeout(120000);
			req.setBodyAsBlob(formDataBlob);

			// Send request
			Logger.debug(logLevel, 'Sending request to Whisper API...');
			Http http = new Http();
			HttpResponse res = http.send(req);

			// Process response
			Logger.debug(logLevel, 'Response Status Code: ' + res.getStatusCode());
			Logger.debug(logLevel, 'Response Body: ' + res.getBody());

			if (res.getStatusCode() == 200) {
				Map<String, Object> responseBody = (Map<String, Object>) JSON.deserializeUntyped(
					res.getBody()
				);
				TranscriptionResponse response = new TranscriptionResponse();
				response.text = (String) responseBody.get('text');
				response.language = (String) responseBody.get('language');
				response.duration = (Double) responseBody.get('duration');
				return response;
			} else {
				String errorMessage =
					'Error calling Whisper API. Status: ' +
					res.getStatusCode() +
					', Response: ' +
					res.getBody();
				throw new WhisperAPIException(errorMessage);
			}
		} catch (Exception e) {
			Logger.error('Error Type: ' + e.getTypeName());
			Logger.error('Error Message: ' + e.getMessage());
			Logger.error('Stack Trace: ' + e.getStackTraceString());
			throw new AuraHandledException(
				'Error transcribing audio: ' + e.getMessage()
			);
		}
	}

	/**
	 * @description Generates audio data from text using OpenAI's Text-to-Speech API
	 * @param text The text to generate audio from
	 * @return TranscriptionResponse containing the audio data and metadata
	 * @throws AuraHandledException if audio generation fails
	 */
	@AuraEnabled
	public static TranscriptionResponse generateAudio(String text) {
		LoggingLevel logLevel = LoggingLevel.DEBUG;
		Logger.debug(logLevel, '=== Starting Text-to-Speech Process ===');

		try {
			// Input validation
			if (String.isBlank(text)) {
				throw new WhisperAPIException('No text provided');
			}

			// Get API key
			String apiKey = getOpenAIKey();

			// Prepare request body
			Map<String, Object> requestBody = new Map<String, Object>{
				'model' => 'tts-1',
				'input' => text,
				'voice' => 'alloy', // Using 'alloy' as default voice
				'response_format' => 'mp3'
			};

			// Prepare HTTP request
			HttpRequest req = new HttpRequest();
			req.setEndpoint('https://api.openai.com/v1/audio/speech');
			req.setMethod('POST');
			req.setHeader('Authorization', 'Bearer ' + apiKey);
			req.setHeader('Content-Type', 'application/json');
			req.setTimeout(120000);
			req.setBody(JSON.serialize(requestBody));

			// Send request
			Logger.debug(logLevel, 'Sending request to OpenAI TTS API...');
			Http http = new Http();
			HttpResponse res = http.send(req);

			// Process response
			Logger.debug(logLevel, 'Response Status Code: ' + res.getStatusCode());

			if (res.getStatusCode() == 200) {
				// Convert binary response to base64
				String audioBase64 = EncodingUtil.base64Encode(res.getBodyAsBlob());

				TranscriptionResponse response = new TranscriptionResponse();
				response.audioBase64 = audioBase64;
				return response;
			} else {
				String errorMessage =
					'Error calling OpenAI TTS API. Status: ' +
					res.getStatusCode() +
					', Response: ' +
					res.getBody();
				throw new WhisperAPIException(errorMessage);
			}
		} catch (Exception e) {
			Logger.error('Error Type: ' + e.getTypeName());
			Logger.error('Error Message: ' + e.getMessage());
			Logger.error('Stack Trace: ' + e.getStackTraceString());
			throw new AuraHandledException(
				'Error generating audio: ' + e.getMessage()
			);
		}
	}

	/**
	 * @description Creates multipart form data for the API request
	 * @param file The file blob to include in the form data
	 * @param contentType The content type of the file
	 * @param filename The name of the file
	 * @param metadataMap Additional metadata to include in the form data
	 * @return Blob The complete multipart form data
	 */
	private static Blob createMultipartFormData(
		Blob file,
		String contentType,
		String filename,
		Map<String, String> metadata
	) {
		contentType = String.isBlank(contentType)
			? 'application/octet-stream'
			: contentType;

		// Create the file part header
		String fileHeader =
			EXTRA_BOUNDARY +
			'\r\n' +
			'Content-Disposition: form-data; name="file"; filename="' +
			filename +
			'"\r\n' +
			'Content-Type: ' +
			contentType +
			'\r\n\r\n';

		// Convert the file part header to hex
		String bodyStartHex = EncodingUtil.convertToHex(Blob.valueOf(fileHeader));

		// Add the file content
		bodyStartHex += EncodingUtil.convertToHex(file);

		// Add metadata fields if present
		if (metadata != null && !metadata.isEmpty()) {
			String formElements = '\r\n';
			for (String key : metadata.keySet()) {
				formElements +=
					EXTRA_BOUNDARY +
					'\r\n' +
					'Content-Disposition: form-data; name="' +
					key +
					'"\r\n\r\n' +
					metadata.get(key) +
					'\r\n';
			}
			bodyStartHex += EncodingUtil.convertToHex(Blob.valueOf(formElements));
		}

		// Add the closing boundary
		String bodyEndHex = EncodingUtil.convertToHex(
			Blob.valueOf(
				(metadata == null || metadata.isEmpty() ? '\r\n' : '') +
					EXTRA_BOUNDARY +
					'--'
			)
		);

		// Combine all parts and convert back to blob
		return EncodingUtil.convertFromHex(bodyStartHex + bodyEndHex);
	}

	/**
	 * @description Retrieves the OpenAI API key from custom settings
	 * @return String The OpenAI API key
	 * @throws WhisperAPIException if the API key is not configured
	 */
	private static String getOpenAIKey() {
		OpenAI_Settings__c settings = OpenAI_Settings__c.getInstance();
		if (settings != null && String.isNotBlank(settings.API_Key__c)) {
			return settings.API_Key__c;
		}
		throw new WhisperAPIException('OpenAI API key not configured');
	}

	/**
	 * @description Retrieves the OpenAI API key for client-side use
	 * @return String The OpenAI API key
	 * @throws AuraHandledException if the API key is not configured
	 */
	@AuraEnabled
	public static String getOpenAIApiKey() {
		OpenAI_Settings__c settings = OpenAI_Settings__c.getInstance();
		if (settings != null && String.isNotBlank(settings.API_Key__c)) {
			return settings.API_Key__c;
		}
		throw new AuraHandledException('OpenAI API key not configured');
	}
}
