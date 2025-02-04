import EVENT_SOURCE_POLYFILL from '@salesforce/resourceUrl/eventSourcePolyfill';
import { loadScript } from 'lightning/platformResourceLoader';

export class EventSourceService {
    constructor() {
        this.debug('[EventSourceService] Initializing');
        this.eventSource = null;
        this.eventHandlers = new Map();
        this.isConnected = false;
        this.currentConversationId = null;
        this.lastAccessToken = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 3;
        this.reconnectInterval = 5000; // 5 seconds
        this.heartbeatTimeout = 90000; // 90 seconds
        this.baseUrl = 'https://orgfarm-e0ea23d84f-dev-ed.develop.my.salesforce-scrt.com';
        this.orgId = '00DKB000000L0ba'; // Add orgId as a property
        this.isPolyfillLoaded = false;
    }

    // Helper method to safely stringify objects for logging
    debug(message, data = null) {
        try {
            const logMessage = data ? `${message} ${JSON.stringify(data, this.jsonReplacer)}` : message;
            console.log(logMessage);
        } catch (error) {
            console.log(message, '(Data could not be stringified)');
            console.log('Original data type:', typeof data);
        }
    }

    // Custom JSON replacer to handle proxy objects and circular references
    jsonReplacer(key, value) {
        if (value instanceof Error) {
            return {
                name: value.name,
                message: value.message,
                stack: value.stack
            };
        }
        if (value instanceof Event) {
            return {
                type: value.type,
                target: value.target
                    ? {
                          readyState: value.target.readyState
                      }
                    : null
            };
        }
        if (value instanceof EventSource) {
            return {
                readyState: value.readyState,
                url: value.url
            };
        }
        return value;
    }

    async initialize(conversationId, accessToken) {
        try {
            this.debug('[EventSourceService] Initializing with:', { conversationId });

            // Store the access token for reconnection attempts
            this.lastAccessToken = accessToken;

            // Load the EventSource polyfill if not already loaded
            if (!this.isPolyfillLoaded) {
                await loadScript(this, EVENT_SOURCE_POLYFILL);
                this.isPolyfillLoaded = true;
            }

            this.currentConversationId = conversationId;

            if (this.eventSource) {
                this.debug('[EventSourceService] Cleaning up existing connection');
                this.cleanup();
            }

            // Use the exact URL structure that worked in Postman
            const sseUrl = `${this.baseUrl}/eventrouter/v1/sse`;

            this.debug('[EventSourceService] Creating EventSource with URL:', { sseUrl });

            // Create EventSource with headers matching the working Postman request
            this.eventSource = new window.EventSourcePolyfill(sseUrl, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'X-Org-Id': this.orgId,
                    Accept: '*/*'
                },
                heartbeatTimeout: this.heartbeatTimeout,
                withCredentials: false
            });

            // Set up event handlers
            return new Promise((resolve, reject) => {
                this.eventSource.onopen = () => {
                    this.debug('[EventSourceService] Connection opened');
                    this.isConnected = true;
                    this.reconnectAttempts = 0;
                    resolve(true);
                };

                this.eventSource.onerror = (error) => {
                    // Add more detailed error logging
                    this.debug('[EventSourceService] Connection error details:', {
                        errorType: error?.type,
                        errorMessage: error?.message,
                        readyState: this.eventSource?.readyState,
                        status: error?.status,
                        statusText: error?.statusText
                    });

                    this.handleConnectionError(error);
                    if (!this.isConnected) {
                        reject(error);
                    }
                };

                // Set up message handlers for different event types
                this.setupEventHandlers();
            });
        } catch (error) {
            this.debug('[EventSourceService] Failed to initialize:', {
                error: error?.message,
                stack: error?.stack
            });
            throw error;
        }
    }

    setupEventHandlers() {
        // Handle routing events
        this.eventSource.addEventListener('CONVERSATION_ROUTING_RESULT', (event) => {
            this.handleEventData(event, 'routing');
        });

        // Handle participant changes
        this.eventSource.addEventListener('CONVERSATION_PARTICIPANT_CHANGED', (event) => {
            this.handleEventData(event, 'participant');
        });

        // Handle conversation messages
        this.eventSource.addEventListener('CONVERSATION_MESSAGE', (event) => {
            this.handleEventData(event, 'message');
        });

        // Handle delivery acknowledgments
        this.eventSource.addEventListener('CONVERSATION_DELIVERY_ACKNOWLEDGEMENT', (event) => {
            this.handleEventData(event, 'delivery');
        });

        // Handle read acknowledgments
        this.eventSource.addEventListener('CONVERSATION_READ_ACKNOWLEDGEMENT', (event) => {
            this.handleEventData(event, 'read');
        });

        // Handle typing indicators
        this.eventSource.addEventListener('CONVERSATION_TYPING_STARTED_INDICATOR', (event) => {
            this.handleEventData(event, 'typing_started');
        });

        this.eventSource.addEventListener('CONVERSATION_TYPING_STOPPED_INDICATOR', (event) => {
            this.handleEventData(event, 'typing_stopped');
        });

        // Handle conversation close
        this.eventSource.addEventListener('CONVERSATION_CLOSE_CONVERSATION', (event) => {
            this.handleEventData(event, 'close');
        });
    }

    handleEventData(event, type) {
        try {
            const data = JSON.parse(event.data);
            if (data.conversationId === this.currentConversationId) {
                this.dispatchEvent('message', {
                    type,
                    data,
                    timestamp: new Date().toISOString()
                });
            }
        } catch (error) {
            this.debug(`[EventSourceService] Error processing ${type} event:`, { error });
        }
    }

    handleConnectionError(error) {
        this.debug('[EventSourceService] Connection error:', {
            errorType: error?.type,
            errorMessage: error?.message,
            readyState: this.eventSource?.readyState
        });

        this.isConnected = false;

        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            this.debug(
                `[EventSourceService] Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})`
            );

            setTimeout(async () => {
                try {
                    await this.initialize(this.currentConversationId, this.lastAccessToken);
                } catch (initError) {
                    this.debug('[EventSourceService] Reconnection failed:', {
                        error: initError?.message,
                        stack: initError?.stack
                    });
                }
            }, this.reconnectInterval);
        } else {
            this.debug('[EventSourceService] Max reconnection attempts reached');
            this.dispatchEvent('error', {
                type: 'connection_failed',
                message: 'Failed to maintain connection to event source',
                details: {
                    errorType: error?.type,
                    errorMessage: error?.message,
                    readyState: this.eventSource?.readyState
                }
            });
        }
    }

    addEventListener(eventName, handler) {
        this.debug('[EventSourceService] Adding event listener', {
            eventName,
            handlerPresent: !!handler
        });
        if (!this.eventHandlers.has(eventName)) {
            this.eventHandlers.set(eventName, new Set());
        }
        this.eventHandlers.get(eventName).add(handler);
    }

    removeEventListener(eventName, handler) {
        this.debug('[EventSourceService] Removing event listener', {
            eventName,
            handlerPresent: !!handler
        });
        if (this.eventHandlers.has(eventName)) {
            this.eventHandlers.get(eventName).delete(handler);
        }
    }

    dispatchEvent(eventName, data) {
        this.debug('[EventSourceService] Dispatching event', {
            eventName,
            data
        });
        if (this.eventHandlers.has(eventName)) {
            const handlers = this.eventHandlers.get(eventName);
            handlers.forEach((handler) => {
                try {
                    handler(data);
                } catch (error) {
                    this.debug('[EventSourceService] Error in event handler', {
                        eventName,
                        error
                    });
                }
            });
        }
    }

    cleanup() {
        this.debug('[EventSourceService] Cleaning up connection');
        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
        }
        this.isConnected = false;
        this.currentConversationId = null;
        this.reconnectAttempts = 0;
        this.eventHandlers.clear();
        this.debug('[EventSourceService] Cleanup complete');
    }
}
