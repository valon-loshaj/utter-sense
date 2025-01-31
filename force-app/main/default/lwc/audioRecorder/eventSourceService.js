import { subscribe, unsubscribe, onError } from "lightning/empApi";

export class EventSourceService {
	constructor() {
		this.debug("[EventSourceService] Initializing");
		this.subscription = null;
		this.eventHandlers = new Map();
		this.isConnected = false;
		this.currentConversationId = null;
	}

	// Helper method to safely stringify objects for logging
	debug(message, data = null) {
		try {
			const logMessage = data
				? `${message} ${JSON.stringify(data, this.jsonReplacer)}`
				: message;
			console.log(logMessage);
		} catch (error) {
			console.log(message, "(Data could not be stringified)");
			console.log("Original data type:", typeof data);
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

	async initialize(conversationId) {
		try {
			this.debug("[EventSourceService] Initializing with:", { conversationId });
			this.currentConversationId = conversationId;

			if (this.subscription) {
				this.debug("[EventSourceService] Cleaning up existing subscription");
				this.cleanup();
			}

			// Define the channel to subscribe to
			const channel = "/event/Utter_Sense_Convo_Entry__e";

			// Set up error listener
			onError((error) => {
				this.debug("[EventSourceService] EMP API error:", { error });
			});

			return new Promise((resolve, reject) => {
				// Subscribe to platform event
				subscribe(channel, -1, (message) => {
					this.debug("[EventSourceService] Received platform event:", { message });
					this.handlePlatformEvent(message);
				})
					.then((subscription) => {
						this.debug("[EventSourceService] Successfully subscribed to channel", {
							channel,
							subscription
						});
						this.subscription = subscription;
						this.isConnected = true;
						resolve(true);
					})
					.catch((error) => {
						this.debug("[EventSourceService] Subscription error:", { error });
						reject(error);
					});
			});
		} catch (error) {
			this.debug("[EventSourceService] Failed to initialize:", { error });
			throw error;
		}
	}

	handlePlatformEvent(message) {
		try {
			const eventData = message.data.payload;

			// Check if this event is for our conversation
			if (eventData.Conversation_Id__c === this.currentConversationId) {
				this.debug("[EventSourceService] Processing platform event for conversation", {
					conversationId: this.currentConversationId
				});

				const messageData = {
					text: eventData.Message_Text__c,
					type: eventData.Sender_Type__c?.toLowerCase(),
					timestamp: eventData.CreatedDate,
					messageId: eventData.Message_Id__c,
					userName: eventData.Sender_Name__c
				};

				this.debug("[EventSourceService] Transformed message data", { messageData });
				this.dispatchEvent("message", messageData);
			} else {
				this.debug("[EventSourceService] Ignoring event for different conversation", {
					eventConversationId: eventData.Conversation_Id__c,
					currentConversationId: this.currentConversationId
				});
			}
		} catch (error) {
			this.debug("[EventSourceService] Error processing platform event:", { error });
		}
	}

	addEventListener(eventName, handler) {
		this.debug("[EventSourceService] Adding event listener", {
			eventName,
			handlerPresent: !!handler
		});
		if (!this.eventHandlers.has(eventName)) {
			this.eventHandlers.set(eventName, new Set());
		}
		this.eventHandlers.get(eventName).add(handler);
		this.debug("[EventSourceService] Current handlers", {
			eventName,
			count: this.eventHandlers.get(eventName).size
		});
	}

	removeEventListener(eventName, handler) {
		this.debug("[EventSourceService] Removing event listener", {
			eventName,
			handlerPresent: !!handler
		});
		if (this.eventHandlers.has(eventName)) {
			this.eventHandlers.get(eventName).delete(handler);
		}
	}

	dispatchEvent(eventName, data) {
		this.debug("[EventSourceService] Dispatching event", {
			eventName,
			data
		});
		if (this.eventHandlers.has(eventName)) {
			const handlers = this.eventHandlers.get(eventName);
			this.debug("[EventSourceService] Found handlers", {
				eventName,
				count: handlers.size
			});
			handlers.forEach((handler) => {
				try {
					handler(data);
				} catch (error) {
					this.debug(`[EventSourceService] Error in event handler`, {
						eventName,
						error:
							error instanceof Error
								? {
										name: error.name,
										message: error.message,
										stack: error.stack
									}
								: error
					});
				}
			});
		} else {
			this.debug("[EventSourceService] No handlers registered", { eventName });
		}
	}

	cleanup() {
		this.debug("[EventSourceService] Cleaning up subscription");
		if (this.subscription) {
			unsubscribe(this.subscription, () => {
				this.debug("[EventSourceService] Successfully unsubscribed");
			});
			this.subscription = null;
			this.isConnected = false;
			this.currentConversationId = null;
		}
		this.eventHandlers.clear();
		this.debug("[EventSourceService] Cleanup complete");
	}
}
