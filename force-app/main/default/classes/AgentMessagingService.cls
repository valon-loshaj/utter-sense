public with sharing class AgentMessagingService {
    // Constants for service configuration
    private static final String BOT_DEVELOPER_NAME = 'Utter_Sense_ES';
    private static final String CLIENT_TYPE = '63';
    private static final String CLIENT_VERSION = '1';
    private static final String AUTH_URL = '/authorization/unauthenticated/access-token';
    private static final String CONVRESATION_URL = '/conversation';
    private static final String MESSAGE_URL = '/iamessage/api/v2/conversation/{{conversationId}}/message';
    private static final String BASE_URL = 'https://orgfarm-0f131521a0-dev-ed.develop.my.salesforce-scrt.com/iamessage/api/v2';
    private static final String ISSUER = UserInfo.getOrganizationId(); // Your org ID
    private static final String SUBJECT = UserInfo.getUserId(); // The user's ID
    private static final Integer TOKEN_EXPIRY = 300; // 5 minutes in seconds
    private static final String CERTIFICATE_NAME = 'Utter_Sense_Certificate'; // Must match exactly with the certificate name in Setup
    
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
            
            // Generate JWT token
            String jwtToken = generateJWT();
            System.debug('JWT Token generated: ' + jwtToken);

            // Formulate the endpoint
            String endpoint = BASE_URL + AUTH_URL;
            System.debug('Endpoint URL: ' + endpoint);

            // Prepare the request body
            Map<String, Object> requestBody = new Map<String, Object>{
                'orgId' => ISSUER,
                'esDeveloperName' => BOT_DEVELOPER_NAME,
                'capabilitiesVersion' => CLIENT_VERSION,
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

            // Process the response
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
     * @return MessagingResponse containing the conversation details
     */
    @AuraEnabled
    public static MessagingResponse createConversation() {
        try {
            System.debug('=== Starting createConversation method ===');
            
            // First, get an access token
            MessagingResponse tokenResponse = getAccessToken();
            if (String.isBlank(tokenResponse.accessToken)) {
                System.debug(LoggingLevel.ERROR, 'Failed to get access token before creating conversation');
                return tokenResponse; // Return the error from token generation
            }
            System.debug('Access token obtained successfully');

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
            req.setHeader('Authorization', 'Bearer ' + tokenResponse.accessToken);
            req.setBody(JSON.serialize(requestBody));
            
            System.debug('Request Headers: ' + req.getHeader('Content-Type'));
            System.debug('Request Method: ' + req.getMethod());
            System.debug('Authorization Header Added: Bearer ' + tokenResponse.accessToken.substring(0, 10) + '...');
            
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
     * @param text The message text to send
     * @param replyToMessageId The ID of the message being replied to
     * @return MessagingResponse containing the message details
     */
    @AuraEnabled
    public static MessagingResponse sendMessage(String conversationId, String text, String replyToMessageId) {
        try {
            // Initialize response
            MessagingResponse response = new MessagingResponse();
            
            // Input validation
            if (String.isBlank(conversationId)) {
                response.error = 'Conversation ID is required';
                return response;
            }
            
            if (String.isBlank(text)) {
                response.error = 'Message text is required';
                return response;
            }
            
            // Prepare the request body
            Map<String, Object> requestBody = new Map<String, Object>{
                'text' => text
            };
            
            if (String.isNotBlank(replyToMessageId)) {
                requestBody.put('replyToMessageId', replyToMessageId);
            }
            
            // Formulate the endpoint
            String endpoint = BASE_URL + MESSAGE_URL.replace('{{conversationId}}', conversationId);
            
            // Create and configure the HTTP request
            HttpRequest req = new HttpRequest();
            req.setEndpoint(endpoint);
            req.setMethod('POST');
            req.setHeader('Content-Type', 'application/json');
            req.setHeader('Authorization', 'Bearer ' + UserInfo.getSessionId());
            System.debug('Authorization Header Added: Bearer ' + UserInfo.getSessionId().substring(0, 10) + '...');
            req.setBody(JSON.serialize(requestBody));
            
            // Send the request
            Http http = new Http();
            HttpResponse res = http.send(req);
            
            // Process the response
            if (res.getStatusCode() == 201 || res.getStatusCode() == 200) {
                Map<String, Object> responseBody = (Map<String, Object>) JSON.deserializeUntyped(res.getBody());
                response.messageId = (String) responseBody.get('messageId');
                response.text = text;
            } else {
                response.error = 'Failed to send message: ' + res.getStatusCode() + ' ' + res.getStatus();
            }
            
            return response;
        } catch (Exception e) {
            MessagingResponse response = new MessagingResponse();
            response.error = 'Error sending message: ' + e.getMessage();
            return response;
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