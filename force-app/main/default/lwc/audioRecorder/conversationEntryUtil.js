// Constants for conversation entry types
export const CONVERSATION_CONSTANTS = {
    EntryTypes: {
        CONVERSATION_MESSAGE: 'CONVERSATION_MESSAGE',
        PARTICIPANT_CHANGED: 'PARTICIPANT_CHANGED',
        ROUTING_RESULT: 'ROUTING_RESULT'
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
        CONVERSATION_MESSAGE: 'CONVERSATION_MESSAGE',
        CONVERSATION_ROUTING_RESULT: 'CONVERSATION_ROUTING_RESULT',
        CONVERSATION_PARTICIPANT_CHANGED: 'CONVERSATION_PARTICIPANT_CHANGED',
        CONVERSATION_TYPING_STARTED_INDICATOR: 'CONVERSATION_TYPING_STARTED_INDICATOR',
        CONVERSATION_TYPING_STOPPED_INDICATOR: 'CONVERSATION_TYPING_STOPPED_INDICATOR',
        CONVERSATION_DELIVERY_ACKNOWLEDGEMENT: 'CONVERSATION_DELIVERY_ACKNOWLEDGEMENT',
        CONVERSATION_READ_ACKNOWLEDGEMENT: 'CONVERSATION_READ_ACKNOWLEDGEMENT',
        CONVERSATION_CLOSE_CONVERSATION: 'CONVERSATION_CLOSE_CONVERSATION'
    }
};

/**
 * Parses JSON data from a server-sent event.
 * @param {object} event - Server-sent event.
 * @returns {object} - Parsed server-sent event data.
 * @throws {Error} if event data is invalid.
 */
export function parseServerSentEventData(event) {
    if (event && event.data && typeof event.data === 'string') {
        const data = JSON.parse(event.data);
        if (!data || typeof data !== 'object') {
            throw new Error('Error parsing data in server sent event.');
        }
        return data;
    }
    throw new Error('Invalid data in server sent event.');
}

/**
 * Creates a conversation entry object from server-sent event data.
 * @param {object} data - Parsed server-sent event data.
 * @returns {object} - Formatted conversation entry.
 */
export function createConversationEntry(data) {
    try {
        if (typeof data === 'object') {
            console.log('[ConversationEntryUtil] Creating entry from data:', data);
            const entryPayload = JSON.parse(data.conversationEntry.entryPayload);
            console.log('[ConversationEntryUtil] Parsed entry payload:', entryPayload);

            // Validate entry type
            if (!Object.values(CONVERSATION_CONSTANTS.EntryTypes).includes(entryPayload.entryType)) {
                console.warn(`Unexpected and/or unsupported entryType: ${entryPayload.entryType}`);
                return null;
            }

            const entry = {
                conversationId: data.conversationId,
                messageId: data.conversationEntry.identifier,
                content: entryPayload.abstractMessage || entryPayload,
                messageType: entryPayload.abstractMessage
                    ? entryPayload.abstractMessage.messageType
                    : entryPayload.routingType || entryPayload.entries?.[0]?.operation,
                entryType: entryPayload.entryType,
                sender: data.conversationEntry.sender,
                actorName: data.conversationEntry.senderDisplayName
                    ? data.conversationEntry.senderDisplayName || data.conversationEntry.sender.role
                    : entryPayload.entries?.[0]?.displayName || entryPayload.entries?.[0]?.participant.role,
                actorType: data.conversationEntry.sender.role,
                transcriptedTimestamp: data.conversationEntry.transcriptedTimestamp,
                messageReason: entryPayload.messageReason
            };

            console.log('[ConversationEntryUtil] Created conversation entry:', entry);
            return entry;
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
    console.log('[ConversationEntryUtil] Getting text content from entry:', entry);

    // Handle static content messages
    if (entry.content?.abstractMessage?.staticContent?.text) {
        return entry.content.abstractMessage.staticContent.text;
    }

    // Handle regular text messages
    return entry.content?.text || entry.content?.abstractMessage?.text || '';
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
