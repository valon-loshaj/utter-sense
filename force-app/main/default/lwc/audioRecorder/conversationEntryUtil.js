// Constants for conversation entry types
export const CONVERSATION_CONSTANTS = {
    EntryTypes: {
        CONVERSATION_MESSAGE: 'Message',
        PARTICIPANT_CHANGED: 'ParticipantChanged',
        ROUTING_RESULT: 'RoutingResult'
    },
    ParticipantRoles: {
        ENDUSER: 'EndUser',
        AGENT: 'Agent',
        CHATBOT: 'Chatbot',
        SYSTEM: 'System'
    },
    RoutingTypes: {
        INITIAL: 'Initial',
        TRANSFER: 'Transfer'
    },
    RoutingFailureTypes: {
        NO_ERROR: 'NoError',
        SUBMISSION_ERROR: 'SubmissionError',
        ROUTING_ERROR: 'RoutingError',
        UNKNOWN_ERROR: 'UnknownError'
    },
    EventTypes: {
        CONVERSATION_MESSAGE: 'Message',
        CONVERSATION_ROUTING_RESULT: 'RoutingResult',
        CONVERSATION_PARTICIPANT_CHANGED: 'ParticipantChanged',
        CONVERSATION_TYPING_STARTED_INDICATOR: 'TypingStartedIndicator',
        CONVERSATION_TYPING_STOPPED_INDICATOR: 'TypingStoppedIndicator',
        CONVERSATION_DELIVERY_ACKNOWLEDGEMENT: 'CONVERSATION_DELIVERY_ACKNOWLEDGEMENT',
        CONVERSATION_READ_ACKNOWLEDGEMENT: 'CONVERSATION_READ_ACKNOWLEDGEMENT',
        CONVERSATION_CLOSE_CONVERSATION: 'CONVERSATION_CLOSE_CONVERSATION'
    }
};

/**
 * Safely converts a proxy object to a plain object
 * @param {object} obj - Object to convert
 * @returns {object} Plain object
 */
function toPlainObject(obj) {
    try {
        if (obj === null || typeof obj !== 'object') {
            return obj;
        }
        return JSON.parse(JSON.stringify(obj));
    } catch (error) {
        console.error('[ConversationEntryUtil] Error converting proxy to plain object:', error);
        return obj;
    }
}

/**
 * Parses JSON data from a server-sent event.
 * @param {object} event - Server-sent event.
 * @returns {object} - Parsed server-sent event data.
 * @throws {Error} if event data is invalid.
 */
export function parseServerSentEventData(event) {
    try {
        console.log('[ConversationEntryUtil] Parsing server event data:', JSON.stringify(event, null, 2));

        // Convert proxy to plain object first
        const plainEvent = toPlainObject(event);

        // If the event.data is already a string, parse it
        if (typeof plainEvent.data === 'string') {
            const data = JSON.parse(plainEvent.data);
            if (!data || typeof data !== 'object') {
                throw new Error('Error parsing data in server sent event.');
            }
            return data;
        }

        // If event.data is an object and needs to be parsed
        if (plainEvent.data && typeof plainEvent.data === 'object') {
            return plainEvent.data;
        }

        throw new Error('Invalid data format in server sent event.');
    } catch (error) {
        console.error('[ConversationEntryUtil] Error parsing server event data:', error);
        throw error;
    }
}

/**
 * Creates a conversation entry object from server-sent event data.
 * @param {object} data - Parsed server-sent event data.
 * @returns {object} - Formatted conversation entry.
 */
export function createConversationEntry(data) {
    try {
        if (typeof data === 'object') {
            // Convert proxy to plain object first
            const plainData = toPlainObject(data);
            console.log('[ConversationEntryUtil] Creating entry from data:', JSON.stringify(plainData, null, 2));

            const entry = plainData.conversationEntry;
            if (!entry) {
                console.warn('[ConversationEntryUtil] No conversation entry found in data');
                return null;
            }

            const entryPayload =
                typeof entry.entryPayload === 'string' ? JSON.parse(entry.entryPayload) : entry.entryPayload;

            console.log('[ConversationEntryUtil] Parsed entry payload:', JSON.stringify(entryPayload, null, 2));

            // More flexible validation for entry type
            const validEntryTypes = Object.values(CONVERSATION_CONSTANTS.EntryTypes);
            const currentEntryType = entry.entryType || entryPayload.entryType;

            if (!validEntryTypes.includes(currentEntryType)) {
                console.warn(`[ConversationEntryUtil] Unexpected and/or unsupported entryType: ${currentEntryType}`);
                return null;
            }

            const result = {
                conversationId: plainData.conversationId,
                messageId: entry.identifier,
                content: entryPayload.abstractMessage || entryPayload,
                messageType: entryPayload.abstractMessage
                    ? entryPayload.abstractMessage.messageType
                    : entryPayload.routingType || entryPayload.entries?.[0]?.operation,
                entryType: currentEntryType,
                sender: entry.sender,
                actorName: entry.senderDisplayName || entry.sender.role,
                actorType: entry.sender.role,
                transcriptedTimestamp: entry.transcriptedTimestamp
            };

            console.log('[ConversationEntryUtil] Created conversation entry:', JSON.stringify(result, null, 2));
            return result;
        }
        return null;
    } catch (err) {
        console.error('[ConversationEntryUtil] Error creating conversation entry:', err);
        return null;
    }
}

/**
 * Checks if a message is from the end user.
 * @param {object} entry - Conversation entry object.
 * @returns {boolean} - True if message is from end user.
 */
export function isMessageFromEndUser(entry) {
    return entry.actorType === CONVERSATION_CONSTANTS.ParticipantRoles.ENDUSER;
}

/**
 * Checks if an entry is a text message.
 * @param {object} entry - Conversation entry object.
 * @returns {boolean} - True if entry is a text message.
 */
export function isTextMessage(entry) {
    return entry.entryType === CONVERSATION_CONSTANTS.EntryTypes.CONVERSATION_MESSAGE;
}

/**
 * Checks if an entry is a participant change event.
 * @param {object} entry - Conversation entry object.
 * @returns {boolean} - True if entry is a participant change.
 */
export function isParticipantChangeEvent(entry) {
    return entry.entryType === CONVERSATION_CONSTANTS.EntryTypes.PARTICIPANT_CHANGED;
}

/**
 * Gets the text content from a message entry.
 * @param {object} entry - Conversation entry object.
 * @returns {string} - Message text content.
 */
export function getTextMessageContent(entry) {
    try {
        console.log('[ConversationEntryUtil] Getting text content from entry:', JSON.stringify(entry, null, 2));

        // Convert proxy to plain object first
        const plainEntry = toPlainObject(entry);

        // Handle static content messages
        if (plainEntry.content?.abstractMessage?.staticContent?.text) {
            return plainEntry.content.abstractMessage.staticContent.text;
        }

        // Handle static content directly in content
        if (plainEntry.content?.staticContent?.text) {
            return plainEntry.content.staticContent.text;
        }

        // Handle regular text messages
        if (plainEntry.content?.text) {
            return plainEntry.content.text;
        }

        // Handle abstract message text
        if (plainEntry.content?.abstractMessage?.text) {
            return plainEntry.content.abstractMessage.text;
        }

        console.warn('[ConversationEntryUtil] No text content found in entry:', JSON.stringify(plainEntry, null, 2));
        return '';
    } catch (error) {
        console.error('[ConversationEntryUtil] Error getting text content:', error);
        return '';
    }
}

/**
 * Gets the sender's display name from event data.
 * @param {object} data - Event data.
 * @returns {string} - Sender's display name.
 */
export function getSenderDisplayName(data) {
    return data?.conversationEntry?.senderDisplayName || '';
}

/**
 * Gets the sender's role from event data.
 * @param {object} data - Event data.
 * @returns {string} - Sender's role.
 */
export function getSenderRole(data) {
    return data?.conversationEntry?.sender?.role || '';
}

/**
 * Checks if a message is from an agent or chatbot.
 * @param {object} entry - Conversation entry object.
 * @returns {boolean} - True if message is from agent or chatbot.
 */
export function isMessageFromAgentOrBot(entry) {
    return (
        entry.actorType === CONVERSATION_CONSTANTS.ParticipantRoles.AGENT ||
        entry.actorType === CONVERSATION_CONSTANTS.ParticipantRoles.CHATBOT
    );
}
