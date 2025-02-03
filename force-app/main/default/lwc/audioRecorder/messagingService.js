import getAccessToken from '@salesforce/apex/AudioRecorderController.getAccessToken';
import createConversation from '@salesforce/apex/AudioRecorderController.createConversation';
import sendMessage from '@salesforce/apex/AudioRecorderController.sendMessage';
import { EventSourceService } from './eventSourceService';

export class MessagingService {
    constructor() {
        console.log('[MessagingService] Initializing');
        this.eventSourceService = new EventSourceService();
        this.messageHandlers = new Set();
        this.accessToken = null;
        this.conversationId = null;
        this.lastMessageId = null;
    }

    async initialize() {
        try {
            console.log('[MessagingService] Starting initialization');

            // First get the access token
            console.log('[MessagingService] Requesting access token');
            const tokenResponse = await getAccessToken();
            if (tokenResponse.error) {
                console.error('[MessagingService] Token error:', tokenResponse.error);
                throw new Error(tokenResponse.error);
            }
            console.log('[MessagingService] Access token received');

            this.accessToken = tokenResponse.accessToken;

            // Create conversation with the access token
            console.log('[MessagingService] Creating conversation');
            const conversationResponse = await createConversation({
                accessToken: this.accessToken
            });

            if (conversationResponse.error) {
                console.error('[MessagingService] Conversation creation error:', conversationResponse.error);
                throw new Error(conversationResponse.error);
            }

            console.log('[MessagingService] Conversation created:', conversationResponse);

            // Store the conversation information
            this.conversationId = conversationResponse.conversationId;

            // Initialize EventSource connection with both conversationId and accessToken
            console.log('[MessagingService] Initializing EventSource connection');
            await this.eventSourceService.initialize(this.conversationId, this.accessToken);

            // Setup message handler
            console.log('[MessagingService] Setting up message handler');
            this.eventSourceService.addEventListener('message', (data) => {
                // Handle different types of messages
                switch (data.type) {
                    case 'message':
                        this.handleIncomingMessage(data.data);
                        break;
                    case 'typing_started':
                        this.handleTypingIndicator(data.data);
                        break;
                    case 'typing_stopped':
                        this.handleTypingIndicator(data.data);
                        break;
                    case 'participant':
                        this.handleParticipantChange(data.data);
                        break;
                    case 'routing':
                        this.handleRoutingEvent(data.data);
                        break;
                    case 'close':
                        this.handleConversationClose();
                        break;
                    default:
                        console.log('[MessagingService] Unhandled message type:', data.type);
                }
            });

            // Add error handler
            this.eventSourceService.addEventListener('error', (error) => {
                console.error('[MessagingService] EventSource error:', error);
                // Handle connection errors, possibly by attempting to refresh the token
                if (error.type === 'connection_failed') {
                    this.handleConnectionFailure();
                }
            });

            console.log('[MessagingService] Initialization complete:', {
                conversationId: this.conversationId
            });

            return true;
        } catch (error) {
            console.error('[MessagingService] Initialization failed:', error);
            throw error;
        }
    }

    // Add message handler registration methods
    addMessageHandler(handler) {
        console.log('[MessagingService] Adding message handler');
        this.messageHandlers.add(handler);
        console.log('[MessagingService] Current handler count:', this.messageHandlers.size);
    }

    removeMessageHandler(handler) {
        console.log('[MessagingService] Removing message handler');
        this.messageHandlers.delete(handler);
    }

    // Handle incoming messages from EventSource
    handleIncomingMessage(data) {
        console.log('[MessagingService] Processing incoming message:', data);
        console.log('[MessagingService] Number of handlers:', this.messageHandlers.size);

        this.messageHandlers.forEach((handler) => {
            try {
                console.log('[MessagingService] Executing handler for message');
                handler(data);
            } catch (error) {
                console.error('[MessagingService] Handler execution error:', error);
            }
        });
    }

    async sendMessage(text) {
        try {
            console.log('[MessagingService] Sending message:', text);

            if (!this.conversationId) {
                throw new Error('Conversation not initialized');
            }

            if (!this.accessToken) {
                throw new Error('Access token not available');
            }

            console.log('[MessagingService] Message details:', {
                conversationId: this.conversationId,
                text: text,
                replyToMessageId: this.lastMessageId
            });

            const response = await sendMessage({
                conversationId: this.conversationId,
                message: text,
                replyToMessageId: '',
                accessToken: this.accessToken
            });

            if (response.error) {
                console.error('[MessagingService] Send message error:', response.error);
                throw new Error(response.error);
            }

            console.log('[MessagingService] Message sent successfully:', response);
            this.lastMessageId = response.messageId;

            return {
                messageId: response.messageId
            };
        } catch (error) {
            console.error('[MessagingService] Send message failed:', error);
            throw error;
        }
    }

    async refreshToken() {
        try {
            console.log('[MessagingService] Refreshing token');
            const response = await getAccessToken();
            if (response.error) {
                throw new Error(response.error);
            }

            this.accessToken = response.accessToken;
            console.log('[MessagingService] Token refreshed, reinitializing EventSource');

            await this.eventSourceService.initialize(this.conversationId, this.accessToken);
            console.log('[MessagingService] Token refresh complete');
        } catch (error) {
            console.error('[MessagingService] Token refresh failed:', error);
            throw error;
        }
    }

    cleanup() {
        console.log('[MessagingService] Cleaning up');
        this.eventSourceService.cleanup();
        this.messageHandlers.clear();
        this.accessToken = null;
        this.conversationId = null;
        this.lastMessageId = null;
        console.log('[MessagingService] Cleanup complete');
    }

    // Add new handler methods
    handleTypingIndicator(data) {
        // Extract the sender information from the conversation entry
        const entry = data.conversationEntry;
        const sender = entry.sender;
        const displayName = entry.senderDisplayName;

        // Notify handlers with the proper typing information
        this.messageHandlers.forEach((handler) => {
            try {
                handler({
                    type: entry.entryType === 'TypingStartedIndicator' ? 'typing_started' : 'typing_stopped',
                    timestamp: data.timestamp,
                    actor: {
                        actorName: displayName,
                        role: sender.role,
                        appType: sender.appType
                    }
                });
            } catch (error) {
                console.error('[MessagingService] Error in typing handler:', error);
            }
        });
    }

    handleParticipantChange(data) {
        // Extract participant information from the conversation entry
        const entry = data.conversationEntry;
        const payload = JSON.parse(entry.entryPayload);

        // Notify handlers with the participant information
        this.messageHandlers.forEach((handler) => {
            try {
                handler({
                    type: 'participant',
                    timestamp: data.timestamp,
                    actor: {
                        actorName: entry.senderDisplayName,
                        role: payload.entries[0].participant.role,
                        appType: payload.entries[0].participant.appType
                    },
                    operation: payload.entries[0].operation
                });
            } catch (error) {
                console.error('[MessagingService] Error in participant handler:', error);
            }
        });
    }

    handleConversationClose() {
        // Notify handlers of conversation close
        this.messageHandlers.forEach((handler) => {
            try {
                handler({
                    type: 'close',
                    timestamp: new Date().toISOString(),
                    text: 'Conversation closed'
                });
            } catch (error) {
                console.error('[MessagingService] Error in close handler:', error);
            }
        });

        // Clean up resources
        this.cleanup();
    }

    async handleConnectionFailure() {
        try {
            // Attempt to refresh the token
            const tokenResponse = await this.refreshToken();
            if (tokenResponse) {
                // Reinitialize the connection with new token
                await this.eventSourceService.initialize(this.conversationId, this.accessToken);
            }
        } catch (error) {
            console.error('[MessagingService] Failed to recover from connection failure:', error);
            this.cleanup();
        }
    }

    // Add new method to handle routing events
    handleRoutingEvent(data) {
        console.log('[MessagingService] Processing routing event:', data);

        // Notify handlers of the routing event
        this.messageHandlers.forEach((handler) => {
            try {
                const entry = data.conversationEntry;
                const payload = JSON.parse(entry.entryPayload);

                handler({
                    type: 'routing',
                    data: data,
                    timestamp: data.timestamp,
                    routingDetails: {
                        routingType: payload.routingType,
                        failureType: payload.failureType,
                        failureReason: payload.failureReason,
                        sender: entry.sender
                    }
                });
            } catch (error) {
                console.error('[MessagingService] Error in routing handler:', error);
            }
        });
    }
}
