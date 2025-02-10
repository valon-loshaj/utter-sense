import { CONVERSATION_CONSTANTS } from './conversationEntryUtil';
import * as ConversationEntryUtil from './conversationEntryUtil';

export class ConversationStateService {
    constructor() {
        console.log('[ConversationStateService] Initializing');
        this.conversation = [];
        this.messageId = 0;
        this.stateChangeHandlers = new Set();
        this.typingParticipants = new Map();
        this.isAnotherParticipantTyping = false;
        this._stateUpdateTimeout = null;
        this._messageQueue = [];
        this._isProcessingQueue = false;
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
        if (this._stateUpdateTimeout) {
            clearTimeout(this._stateUpdateTimeout);
        }

        this._stateUpdateTimeout = setTimeout(() => {
            requestAnimationFrame(() => {
                console.log('[ConversationStateService] Notifying state change');
                const conversationCopy = [...this.conversation];
                this.stateChangeHandlers.forEach((handler) => {
                    try {
                        handler(conversationCopy);
                    } catch (error) {
                        console.error('[ConversationStateService] Error in state change handler:', error);
                    }
                });
            });
        }, 16); // One frame at 60fps
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

        this._messageQueue.push(message);
        this._processMessageQueue();

        return message;
    }

    // Process message queue to batch updates
    async _processMessageQueue() {
        if (this._isProcessingQueue) return;
        this._isProcessingQueue = true;

        while (this._messageQueue.length > 0) {
            const messages = this._messageQueue.splice(0, Math.min(5, this._messageQueue.length));

            await new Promise((resolve) => {
                requestAnimationFrame(() => {
                    this.conversation = [...this.conversation, ...messages];
                    this.notifyStateChange();
                    resolve();
                });
            });

            // Small delay between batches if there are more messages
            if (this._messageQueue.length > 0) {
                await new Promise((resolve) => setTimeout(resolve, 32));
            }
        }

        this._isProcessingQueue = false;
    }

    // Clear conversation
    clearConversation() {
        console.log('[ConversationStateService] Clearing conversation');
        this.conversation = [];
        this.messageId = 0;
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
        try {
            console.log('[ConversationStateService] Handling conversation message:', JSON.stringify(entry, null, 2));

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

            // Determine the message type based on the actor type
            let messageType;
            if (isEndUser) {
                messageType = 'user';
            } else if (isAgentOrBot) {
                messageType = 'agent';
            } else {
                messageType = 'system';
            }

            const message = this.addMessage(messageText, messageType, entry.actorName, true);

            message.messageId = entry.messageId;
            message.isAgentMessage = isAgentOrBot;

            console.log('[ConversationStateService] Created message:', JSON.stringify(message, null, 2));
            return message;
        } catch (error) {
            console.error('[ConversationStateService] Error handling conversation message:', error);
            return null;
        }
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
        console.log('[ConversationStateService] Handling routing result:', entry);
        let messageText = '';

        // Extract routing information from the entry payload
        const routingType = entry.content.routingType;
        const failureType = entry.content.failureType;
        const failureReason = entry.content.failureReason;

        if (routingType === 'Initial') {
            if (failureType === 'None') {
                messageText = 'Connecting to service...';
            } else {
                messageText = `Connection failed: ${failureReason || 'Unknown error'}`;
            }
        } else if (routingType === 'Transfer') {
            if (failureType === 'None') {
                messageText = 'Transferring conversation...';
            } else {
                messageText = `Transfer failed: ${failureReason || 'Unknown error'}`;
            }
        }

        console.log('[ConversationStateService] Creating routing message:', messageText);
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
