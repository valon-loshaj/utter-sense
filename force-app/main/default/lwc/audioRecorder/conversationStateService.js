import { CONVERSATION_CONSTANTS } from './conversationEntryUtil';
import * as ConversationEntryUtil from './conversationEntryUtil';

export class ConversationStateService {
    constructor() {
        console.log('[ConversationStateService] Initializing');
        this.conversation = [];
        this.messageId = 0;
        this.stateChangeHandlers = new Set();
        this.currentTranscription = null;
        this.typingParticipants = new Map();
        this.isAnotherParticipantTyping = false;
    }

    // Add state change handler registration methods
    addStateChangeHandler(handler) {
        console.log('[ConversationStateService] Adding state change handler');
        this.stateChangeHandlers.add(handler);
        console.log('[ConversationStateService] Current handler count:', this.stateChangeHandlers.size);
    }

    removeStateChangeHandler(handler) {
        console.log('[ConversationStateService] Removing state change handler');
        this.stateChangeHandlers.delete(handler);
    }

    // Notify handlers of state changes
    notifyStateChange() {
        console.log('[ConversationStateService] Notifying state change');
        console.log('[ConversationStateService] Current conversation state:', this.conversation);
        console.log('[ConversationStateService] Number of handlers:', this.stateChangeHandlers.size);

        const conversationCopy = [...this.conversation];
        this.stateChangeHandlers.forEach((handler) => {
            try {
                console.log('[ConversationStateService] Executing state change handler');
                handler(conversationCopy);
            } catch (error) {
                console.error('[ConversationStateService] Error in state change handler:', error);
            }
        });
    }

    // Add a message to the conversation
    addMessage(text, type, userName, shouldFadeIn = false) {
        console.log('[ConversationStateService] Adding message:', {
            text,
            type,
            userName,
            shouldFadeIn
        });

        const message = {
            id: window.crypto.randomUUID(),
            text: text.trim(),
            type: type || 'none',
            timestamp: new Date().toISOString(),
            isLoading: false,
            userName: userName,
            isAgentMessage: type === 'agent',
            fadeIn: shouldFadeIn,
            fadeOut: false
        };

        console.log('[ConversationStateService] Created message object:', message);

        // Create a new array to ensure reactivity
        this.conversation = [...this.conversation, message];
        console.log('[ConversationStateService] Updated conversation array:', this.conversation);

        this.notifyStateChange();
        return message;
    }

    // Update current transcription
    updateCurrentTranscription(text) {
        if (!this.currentTranscription) {
            this.currentTranscription = this.addMessage(text, 'transcription', 'You', true);
        } else {
            this.currentTranscription.text = text;
            this.notifyStateChange();
        }
    }

    // Remove current transcription
    removeCurrentTranscription() {
        console.log('[ConversationStateService] Removing current transcription');
        if (this.currentTranscription) {
            const index = this.conversation.findIndex((msg) => msg.id === this.currentTranscription.id);
            if (index !== -1) {
                this.conversation[index].fadeOut = true;
                this.notifyStateChange();
                setTimeout(() => {
                    this.conversation = this.conversation.filter((msg) => msg.id !== this.currentTranscription.id);
                    this.notifyStateChange();
                }, 300);
            }
            this.currentTranscription = null;
        }
    }

    // Clear conversation
    clearConversation() {
        console.log('[ConversationStateService] Clearing conversation');
        this.conversation = [];
        this.messageId = 0;
        this.currentTranscription = null;
        this.typingParticipants.clear();
        this.isAnotherParticipantTyping = false;
        this.notifyStateChange();
    }

    // Get current conversation state
    getConversation() {
        console.log('[ConversationStateService] Getting conversation state');
        return this.conversation;
    }

    // Handle incoming message from server
    handleServerMessage(messageData) {
        console.log('[ConversationStateService] Handling server message:', messageData);

        try {
            const parsedData = ConversationEntryUtil.parseServerSentEventData(messageData);
            console.log('[ConversationStateService] Parsed server data:', parsedData);

            const conversationEntry = ConversationEntryUtil.createConversationEntry(parsedData);
            console.log('[ConversationStateService] Created conversation entry:', conversationEntry);

            if (!conversationEntry) {
                console.warn('[ConversationStateService] No conversation entry created');
                return null;
            }

            switch (conversationEntry.entryType) {
                case CONVERSATION_CONSTANTS.EntryTypes.CONVERSATION_MESSAGE:
                    return this.handleConversationMessage(conversationEntry);
                case CONVERSATION_CONSTANTS.EntryTypes.PARTICIPANT_CHANGED:
                    return this.handleParticipantChanged(conversationEntry);
                case CONVERSATION_CONSTANTS.EntryTypes.ROUTING_RESULT:
                    return this.handleRoutingResult(conversationEntry);
                default:
                    console.warn(`[ConversationStateService] Unhandled entry type: ${conversationEntry.entryType}`);
                    return null;
            }
        } catch (error) {
            console.error('[ConversationStateService] Error handling server message:', error);
            return null;
        }
    }

    handleConversationMessage(entry) {
        console.log('[ConversationStateService] Handling conversation message:', entry);

        const isEndUser = ConversationEntryUtil.isMessageFromEndUser(entry);
        const isAgentOrBot = ConversationEntryUtil.isMessageFromAgentOrBot(entry);
        const messageText = ConversationEntryUtil.getTextMessageContent(entry);

        console.log('[ConversationStateService] Message details:', {
            isEndUser,
            isAgentOrBot,
            messageText,
            actorType: entry.actorType,
            actorName: entry.actorName
        });

        if (!messageText) {
            console.warn('[ConversationStateService] No message text found');
            return null;
        }

        const message = this.addMessage(
            messageText,
            isEndUser ? 'user' : isAgentOrBot ? 'agent' : 'system',
            entry.actorName,
            true
        );

        message.messageId = entry.messageId;
        message.isAgentMessage = isAgentOrBot;

        console.log('[ConversationStateService] Created message:', message);
        return message;
    }

    handleParticipantChanged(entry) {
        const participantName = entry.actorName;
        const operation = entry.messageType;
        let messageText = '';

        switch (operation) {
            case 'Add':
                messageText = `${participantName} joined the conversation`;
                break;
            case 'Remove':
                messageText = `${participantName} left the conversation`;
                break;
            default:
                messageText = `${participantName} ${operation}`;
        }

        return this.addMessage(messageText, 'system', 'System', true);
    }

    handleRoutingResult(entry) {
        let messageText = '';

        if (entry.messageType === CONVERSATION_CONSTANTS.RoutingTypes.INITIAL) {
            if (entry.content.failureType !== CONVERSATION_CONSTANTS.RoutingFailureTypes.NO_ERROR) {
                messageText = `Initial routing failed: ${entry.content.reasonForNotRouting}`;
            } else {
                messageText = 'Conversation started successfully';
            }
        } else if (entry.messageType === CONVERSATION_CONSTANTS.RoutingTypes.TRANSFER) {
            if (entry.content.failureType === CONVERSATION_CONSTANTS.RoutingFailureTypes.NO_ERROR) {
                messageText = 'Transferring conversation...';
            } else {
                messageText = `Transfer failed: ${entry.content.reasonForNotRouting}`;
            }
        }

        return messageText ? this.addMessage(messageText, 'system', 'System', true) : null;
    }

    handleTypingIndicator(entry, isTyping) {
        const senderName = entry.actorName;

        if (isTyping) {
            this.typingParticipants.set(senderName, {
                role: entry.actorType,
                timestamp: Date.now()
            });
        } else {
            this.typingParticipants.delete(senderName);
        }

        this.isAnotherParticipantTyping = this.typingParticipants.size > 0;
        this.notifyStateChange();
    }

    getTypingParticipants() {
        return Array.from(this.typingParticipants.entries()).map(([name, data]) => ({
            name,
            role: data.role
        }));
    }
}
