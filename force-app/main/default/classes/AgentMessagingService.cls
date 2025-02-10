public with sharing class AgentMessagingService {
    // Constants for service configuration
    private static String BOT_DEVELOPER_NAME;
    private static String AUTH_URL;
    private static String CONVRESATION_URL;
    private static String MESSAGE_URL;
    private static String BASE_URL;
    private static String ISSUER = UserInfo.getOrganizationId();
    private static String SUBJECT = UserInfo.getUserId();
    private static Integer TOKEN_EXPIRY;
    private static String CERTIFICATE_NAME;
    private static String PLATFORM = 'Web';
    private static String CAPABILITIES_VERSION;
    
    // Configuration metadata
    private static Utter_Sense_Audio_Recorder_Configs__mdt audioRecorderConfig;
    private static final String DEFAULT_CONFIG_NAME = 'Utter_Sense_Configs';
    private static String configurationName;
    
    // Custom exception for configuration errors
    public class ConfigurationException extends Exception {}
    
    /**
     * @description Sets the configuration name to be used for retrieving custom metadata
     * @param configName The developer name of the custom metadata record to use
     * @throws ConfigurationException if the configuration cannot be loaded
     */
    @AuraEnabled
    public static void setConfigurationName(String configName) {
        try {
            if (String.isBlank(configName)) {
                throw new ConfigurationException('Configuration name cannot be blank');
            }
            configurationName = configName;
            initializeConfiguration();
        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR, 'Error setting configuration name: ' + e.getMessage());
            System.debug(LoggingLevel.ERROR, 'Stack trace: ' + e.getStackTraceString());
            throw new AuraHandledException('Failed to set configuration: ' + e.getMessage());
        }
    }
    
    /**
     * @description Gets the current configuration name being used
     * @return String The developer name of the custom metadata record
     */
    public static String getConfigurationName() {
        return String.isBlank(configurationName) ? DEFAULT_CONFIG_NAME : configurationName;
    }
    
    /**
     * @description Initializes the configuration using the current configuration name
     * @throws ConfigurationException if configuration cannot be loaded
     */
    private static void initializeConfiguration() {
        try {
            // Get the configuration record using the current configuration name
            audioRecorderConfig = Utter_Sense_Audio_Recorder_Configs__mdt.getInstance(getConfigurationName());
            
            // Validate that the configuration exists
            if (audioRecorderConfig == null) {
                throw new ConfigurationException('Audio Recorder configuration "' + getConfigurationName() + '" not found. Please ensure the custom metadata record exists.');
            }
            
            // Validate required fields and initialize constants
            validateAndInitializeConfig();
            
        } catch (Exception e) {
            // Log the error and throw a more user-friendly message
            System.debug(LoggingLevel.ERROR, 'Failed to initialize AgentMessagingService configuration: ' + e.getMessage());
            System.debug(LoggingLevel.ERROR, 'Stack trace: ' + e.getStackTraceString());
            throw new ConfigurationException('Failed to initialize messaging service configuration. Please contact your system administrator.');
        }
    }
    
    // Static initialization block to load default configuration
    static {
        initializeConfiguration();
    }
    
    /**
     * @description Validates configuration fields and initializes constants
     * @throws ConfigurationException if required fields are missing
     */
    private static void validateAndInitializeConfig() {
        // Validate and initialize each required field
        if (String.isBlank(audioRecorderConfig.Bot_Developer_Name__c)) {
            throw new ConfigurationException('Bot Developer Name is required in the configuration.');
        }
        BOT_DEVELOPER_NAME = audioRecorderConfig.Bot_Developer_Name__c;
        
        if (String.isBlank(audioRecorderConfig.Auth_URL__c)) {
            throw new ConfigurationException('Auth URL is required in the configuration.');
        }
        AUTH_URL = audioRecorderConfig.Auth_URL__c;
        
        if (String.isBlank(audioRecorderConfig.Conversation_Endpoint__c)) {
            throw new ConfigurationException('Conversation Endpoint is required in the configuration.');
        }
        CONVRESATION_URL = audioRecorderConfig.Conversation_Endpoint__c;
        
        if (String.isBlank(audioRecorderConfig.Message_Endpoint__c)) {
            throw new ConfigurationException('Message Endpoint is required in the configuration.');
        }
        MESSAGE_URL = audioRecorderConfig.Message_Endpoint__c;
        
        if (String.isBlank(audioRecorderConfig.Base_URL__c)) {
            throw new ConfigurationException('Base URL is required in the configuration.');
        }
        BASE_URL = audioRecorderConfig.Base_URL__c;
        
        if (audioRecorderConfig.Token_Expiration_in_Seconds__c == null) {
            throw new ConfigurationException('Token Expiration is required in the configuration.');
        }
        try {
            TOKEN_EXPIRY = Integer.valueOf(audioRecorderConfig.Token_Expiration_in_Seconds__c);
        } catch (Exception e) {
            throw new ConfigurationException('Token Expiration must be a valid integer.');
        }
        
        if (String.isBlank(audioRecorderConfig.Certificate_API_Name__c)) {
            throw new ConfigurationException('Certificate API Name is required in the configuration.');
        }
        CERTIFICATE_NAME = audioRecorderConfig.Certificate_API_Name__c;
        
        if (String.isBlank(audioRecorderConfig.Capabilities_Version__c)) {
            throw new ConfigurationException('Capabilities Version is required in the configuration.');
        }
        CAPABILITIES_VERSION = audioRecorderConfig.Capabilities_Version__c;
    }
    
    // Inner class to handle responses
    public class MessagingResponse {
        @AuraEnabled public String conversationId { get; set; }
        @AuraEnabled public String messageId { get; set; }
        @AuraEnabled public String accessToken { get; set; }
        @AuraEnabled public String tokenType { get; set; }
        @AuraEnabled public Long tokenExpiry { get; set; }
        @AuraEnabled public String error { get; set; }
        @AuraEnabled public String text { get; set; }
        
        public MessagingResponse() {}
    }
    
    /**
     * @description Retrieves the Audio Recorder configuration from custom metadata
     * @return Utter_Sense_Audio_Recorder_Configs__mdt The configuration record
     * @throws ConfigurationException if the configuration is not found
     */
    @TestVisible
    private static Utter_Sense_Audio_Recorder_Configs__mdt getAudioRecorderConfig() {
        if (audioRecorderConfig == null) {
            audioRecorderConfig = Utter_Sense_Audio_Recorder_Configs__mdt.getInstance('Utter_Sense_Configs');
            if (audioRecorderConfig == null) {
                throw new ConfigurationException('Audio Recorder configuration "Utter_Sense_Configs" not found. Please ensure the custom metadata record exists.');
            }
        }
        return audioRecorderConfig;
    }
    
    /**
     * @description Creates a JWT token for authentication
     * @return String The generated JWT token
     */
    private static String generateJWT() {
        try {
            // Create JWT header
            Map<String, String> header = new Map<String, String>{
                'alg' => 'RS256',
                'typ' => 'JWT',
                'kid' => CERTIFICATE_NAME
            };
            
            // Get current timestamp for JWT claims
            Long currentTime = System.currentTimeMillis() / 1000;
            Long expirationTime = currentTime + TOKEN_EXPIRY;
            
            // Create JWT claims
            Map<String, Object> claims = new Map<String, Object>{
                'iss' => ISSUER,
                'sub' => SUBJECT,
                'aud' => BASE_URL,
                'iat' => currentTime,
                'exp' => expirationTime,
                'orgId' => ISSUER,
                'userId' => SUBJECT
            };
            
            // Generate the JWT using Named Credential
            String headerJson = JSON.serialize(header);
            String claimsJson = JSON.serialize(claims);
            
            // Base64URL encode the header and claims
            String encodedHeader = EncodingUtil.base64Encode(Blob.valueOf(headerJson)).replace('+', '-').replace('/', '_').replace('=', '');
            String encodedClaims = EncodingUtil.base64Encode(Blob.valueOf(claimsJson)).replace('+', '-').replace('/', '_').replace('=', '');
            
            // Create the signing input
            String signingInput = encodedHeader + '.' + encodedClaims;
            
            // Sign the input using the certificate
            Blob signature = Crypto.signWithCertificate(
                'RSA-SHA256', 
                Blob.valueOf(signingInput), 
                CERTIFICATE_NAME
            );
            
            // Base64URL encode the signature
            String encodedSignature = EncodingUtil.base64Encode(signature).replace('+', '-').replace('/', '_').replace('=', '');
            
            // Return the complete JWT
            return encodedHeader + '.' + encodedClaims + '.' + encodedSignature;
        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR, 'Error generating JWT: ' + e.getMessage());
            System.debug(LoggingLevel.ERROR, 'Stack trace: ' + e.getStackTraceString());
            throw new AgentMessagingException('Failed to generate JWT: ' + e.getMessage());
        }
    }
    
    /**
     * Custom exception class for AgentMessagingService
     */
    public class AgentMessagingException extends Exception {}
    
    /**
     * @description Creates a new access token for the messaging service
     * @return MessagingResponse containing the access token details
     */
    @AuraEnabled
    public static MessagingResponse getAccessToken() {
        try {
            System.debug('=== Starting getAccessToken method ===');
            
            // Generate JWT token using the generateJWT method
            String jwtToken = generateJWT();
            System.debug('JWT Token generated: ' + jwtToken);

            // Formulate the auth endpoint
            String endpoint = BASE_URL + AUTH_URL;
            System.debug('Endpoint URL: ' + endpoint);

            // Prepare the request body
            Map<String, Object> requestBody = new Map<String, Object>{
                'orgId' => ISSUER,
                'esDeveloperName' => BOT_DEVELOPER_NAME,
                'capabilitiesVersion' => CAPABILITIES_VERSION,
                'platform' => 'Web'
            };
            System.debug('Request Body: ' + JSON.serializePretty(requestBody));

            // Create and configure the HTTP request
            HttpRequest req = new HttpRequest();
            req.setEndpoint(endpoint);
            req.setMethod('POST');
            req.setHeader('Content-Type', 'application/json');
            req.setBody(JSON.serialize(requestBody));
            
            System.debug('Request Headers: ' + req.getHeader('Content-Type'));
            System.debug('Request Method: ' + req.getMethod());

            // Send the request
            Http http = new Http();
            System.debug('Sending HTTP request...');
            HttpResponse res = http.send(req);

            // Process the response: success should contain accessToken
            System.debug('Response Status Code: ' + res.getStatusCode());
            System.debug('Response Status: ' + res.getStatus());
            System.debug('Response Body: ' + res.getBody());

            if (res.getStatusCode() == 201 || res.getStatusCode() == 200) {
                System.debug('Request successful, processing response body...');
                Map<String, Object> responseBody = (Map<String, Object>) JSON.deserializeUntyped(res.getBody());
                System.debug('Deserialized Response: ' + JSON.serializePretty(responseBody));
                
                MessagingResponse response = new MessagingResponse();
                response.accessToken = (String) responseBody.get('accessToken');
                System.debug('Access Token Retrieved: ' + (String.isNotBlank(response.accessToken) ? 'Yes' : 'No'));
                return response;
            }
            else {
                System.debug('Request failed with status code: ' + res.getStatusCode());
                MessagingResponse response = new MessagingResponse();
                response.error = 'Failed to get access token: ' + res.getStatusCode() + ' ' + res.getStatus();
                return response;
            }
        }
        catch (Exception e) {
            System.debug(LoggingLevel.ERROR, 'Exception Type: ' + e.getTypeName());
            System.debug(LoggingLevel.ERROR, 'Exception Message: ' + e.getMessage());
            System.debug(LoggingLevel.ERROR, 'Stack Trace: ' + e.getStackTraceString());
            
            MessagingResponse response = new MessagingResponse();
            response.error = 'Error getting access token: ' + e.getMessage();
            return response;
        }
        finally {
            System.debug('=== Ending getAccessToken method ===');
        }
    }

    /**
     * @description Initializes a new conversation with the messaging service
     * @return MessagingResponse containing the conversation ID
     */
    @AuraEnabled
    public static MessagingResponse createConversation(String accessToken) {
        try {
            System.debug('=== Starting createConversation method ===');
            
            if (String.isBlank(accessToken)) {
                System.debug(LoggingLevel.ERROR, 'Access token is required');
                MessagingResponse errorResponse = new MessagingResponse();
                errorResponse.error = 'Access token is required';
                return errorResponse;
            }
            System.debug('Access token validation passed');

            // Generate a UUID for the conversation
            String conversationId = generateUUID();
            System.debug('Generated Conversation ID: ' + conversationId);
            
            // Initialize response
            MessagingResponse response = new MessagingResponse();
            
            // Prepare the request body - keeping it minimal as per example
            Map<String, Object> requestBody = new Map<String, Object>{
                'esDeveloperName' => BOT_DEVELOPER_NAME,
                'conversationId' => conversationId
            };
            System.debug('Request Body: ' + JSON.serializePretty(requestBody));
            
            // Formulate the endpoint
            String endpoint = BASE_URL + CONVRESATION_URL;
            System.debug('Endpoint URL: ' + endpoint);

            // Create and configure the HTTP request
            HttpRequest req = new HttpRequest();
            req.setEndpoint(endpoint);
            req.setMethod('POST');
            req.setHeader('Content-Type', 'application/json');
            req.setHeader('Authorization', 'Bearer ' + accessToken);
            req.setBody(JSON.serialize(requestBody));
            
            System.debug('Request Headers: ' + req.getHeader('Content-Type'));
            System.debug('Request Method: ' + req.getMethod());
            System.debug('Authorization Header Added: Bearer ' + accessToken.substring(0, 10) + '...');
            
            // Send the request
            Http http = new Http();
            System.debug('Sending HTTP request...');
            HttpResponse res = http.send(req);
            
            // Process the response
            System.debug('Response Status Code: ' + res.getStatusCode());
            System.debug('Response Status: ' + res.getStatus());
            System.debug('Response Body: ' + res.getBody());
            
            if (res.getStatusCode() == 201 || res.getStatusCode() == 200) {
                System.debug('Request successful - empty response body is expected');
                response.conversationId = conversationId;
                System.debug('Conversation created successfully. Conversation ID: ' + response.conversationId);
            } else {
                System.debug(LoggingLevel.ERROR, 'Request failed with status code: ' + res.getStatusCode());
                response.error = 'Failed to create conversation: ' + res.getStatusCode() + ' ' + res.getStatus();
                if (String.isNotBlank(res.getBody())) {
                    response.error += ' - ' + res.getBody();
                }
                System.debug(LoggingLevel.ERROR, 'Error: ' + response.error);
            }
            
            return response;
        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR, 'Exception Type: ' + e.getTypeName());
            System.debug(LoggingLevel.ERROR, 'Exception Message: ' + e.getMessage());
            System.debug(LoggingLevel.ERROR, 'Stack Trace: ' + e.getStackTraceString());
            
            MessagingResponse response = new MessagingResponse();
            response.error = 'Error creating conversation: ' + e.getMessage();
            return response;
        } finally {
            System.debug('=== Ending createConversation method ===');
        }
    }
    
    /**
     * @description Sends a message in an existing conversation
     * @param conversationId The ID of the conversation
     * @param message The message text to send
     * @param replyToMessageId The ID of the message being replied to
     * @param accessToken The access token used to create the conversation
     * @return MessagingResponse containing the message details
     */
    @AuraEnabled
    public static MessagingResponse sendMessage(String conversationId, String message, String replyToMessageId, String accessToken) {
        try {
            System.debug('=== Starting sendMessage method ===');
            System.debug('Input Parameters - conversationId: ' + conversationId + ', message length: ' + (message != null ? message.length() : 0) + ', replyToMessageId: ' + replyToMessageId);
            
            // Initialize response
            MessagingResponse response = new MessagingResponse();
            
            // Input validation
            if (String.isBlank(conversationId)) {
                System.debug(LoggingLevel.ERROR, 'Validation failed: Conversation ID is required');
                response.error = 'Conversation ID is required';
                return response;
            }
            
            if (String.isBlank(message)) {
                System.debug(LoggingLevel.ERROR, 'Validation failed: Message text is required');
                response.error = 'Message text is required';
                return response;
            }

            if (String.isBlank(accessToken)) {
                System.debug(LoggingLevel.ERROR, 'Validation failed: Access token is required');
                response.error = 'Access token is required';
                return response;
            }
            
            // Create request structure
            Map<String, Object> requestBody = new Map<String, Object>();
            
            // Create the message object
            Map<String, Object> messageObj = new Map<String, Object>();
            messageObj.put('inReplyToMessageId', String.isBlank(replyToMessageId) ? '' : replyToMessageId);
            messageObj.put('id', generateUUID());
            messageObj.put('messageType', 'StaticContentMessage');
            
            // Create the staticContent object
            Map<String, Object> staticContent = new Map<String, Object>();
            staticContent.put('formatType', 'Text');
            staticContent.put('text', message);
            messageObj.put('staticContent', staticContent);
            
            // Build the complete request structure - order matters for some APIs
            requestBody.put('message', messageObj);
            requestBody.put('esDeveloperName', BOT_DEVELOPER_NAME);
            requestBody.put('isNewMessagingSession', true);
            requestBody.put('routingAttributes', new Map<String, Object>());
            requestBody.put('language', 'en');
            
            System.debug('Request Body: ' + JSON.serializePretty(requestBody));
            
            // Formulate the endpoint
            String endpoint = BASE_URL + MESSAGE_URL.replace('{{conversationId}}', conversationId);
            System.debug('Endpoint URL: ' + endpoint);
            
            // Create and configure the HTTP request
            HttpRequest req = new HttpRequest();
            req.setEndpoint(endpoint);
            req.setMethod('POST');
            req.setHeader('Content-Type', 'application/json');
            req.setHeader('Authorization', 'Bearer ' + accessToken);
            req.setBody(JSON.serialize(requestBody));
            
            System.debug('Request Headers: ' + req.getHeader('Content-Type'));
            System.debug('Request Method: ' + req.getMethod());
            System.debug('Authorization Header Added: Bearer ' + accessToken.substring(0, Math.min(accessToken.length(), 10)) + '...');
            
            // Send the request
            Http http = new Http();
            System.debug('Sending HTTP request...');
            HttpResponse res = http.send(req);
            
            // Process the response
            System.debug('Response Status Code: ' + res.getStatusCode());
            System.debug('Response Status: ' + res.getStatus());
            System.debug('Response Body: ' + res.getBody());
            
            if (res.getStatusCode() == 201 || res.getStatusCode() == 200 || res.getStatusCode() == 202) {
                System.debug('Request successful, processing response body...');
                Map<String, Object> responseBody = (Map<String, Object>) JSON.deserializeUntyped(res.getBody());
                response.messageId = (String) responseBody.get('messageId');
                response.text = (String) responseBody.get('text');
                System.debug('Message sent successfully. Message ID: ' + response.messageId);
            } else {
                System.debug(LoggingLevel.ERROR, 'Request failed with status code: ' + res.getStatusCode());
                response.error = 'Failed to send message: ' + res.getStatusCode() + ' ' + res.getStatus();
                if (String.isNotBlank(res.getBody())) {
                    response.error += ' - ' + res.getBody();
                }
                System.debug(LoggingLevel.ERROR, 'Error: ' + response.error);
            }
            
            return response;
        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR, 'Exception Type: ' + e.getTypeName());
            System.debug(LoggingLevel.ERROR, 'Exception Message: ' + e.getMessage());
            System.debug(LoggingLevel.ERROR, 'Stack Trace: ' + e.getStackTraceString());
            
            MessagingResponse response = new MessagingResponse();
            response.error = 'Error sending message: ' + e.getMessage();
            return response;
        } finally {
            System.debug('=== Ending sendMessage method ===');
        }
    }

    /**
     * @description Creates a UUID for the conversation in proper v4 format
     * @return UUID in the format of xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx (String) where y is one of 8,9,a,b
     */
    private static String generateUUID() {
        Blob b = Crypto.generateAesKey(128);
        String h = EncodingUtil.convertToHex(b);
        
        // Get the UUID components
        String timelow = h.substring(0,8);
        String timemid = h.substring(8,12);
        String timehi = '4' + h.substring(13,16); // Set version to 4
        String varient = '8' + h.substring(17,20); // Set variant to RFC4122
        String node = h.substring(20,32);
        
        // Combine all parts and ensure lowercase
        String uuid = (timelow + '-' + timemid + '-' + timehi + '-' + varient + '-' + node).toLowerCase();
        
        System.debug('Generated UUID: ' + uuid);
        return uuid;
    }
} 