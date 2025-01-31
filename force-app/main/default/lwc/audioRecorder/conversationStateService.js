export class ConversationStateService {
	constructor() {
		console.log("[ConversationStateService] Initializing");
		this.conversation = [];
		this.messageId = 0;
		this.stateChangeHandlers = new Set();
		this.currentTranscription = null;
	}

	// Add state change handler registration methods
	addStateChangeHandler(handler) {
		console.log("[ConversationStateService] Adding state change handler");
		this.stateChangeHandlers.add(handler);
		console.log(
			"[ConversationStateService] Current handler count:",
			this.stateChangeHandlers.size
		);
	}

	removeStateChangeHandler(handler) {
		console.log("[ConversationStateService] Removing state change handler");
		this.stateChangeHandlers.delete(handler);
	}

	// Notify handlers of state changes
	notifyStateChange() {
		console.log("[ConversationStateService] Notifying state change");
		console.log("[ConversationStateService] Current conversation state:", this.conversation);
		console.log(
			"[ConversationStateService] Number of handlers:",
			this.stateChangeHandlers.size
		);

		this.stateChangeHandlers.forEach((handler) => {
			try {
				console.log("[ConversationStateService] Executing state change handler");
				handler(this.conversation);
			} catch (error) {
				console.error("[ConversationStateService] Error in state change handler:", error);
			}
		});
	}

	// Add a message to the conversation
	addMessage(text, type, userName, shouldFadeIn = false) {
		console.log("[ConversationStateService] Adding message:", {
			text,
			type,
			userName,
			shouldFadeIn
		});

		const message = {
			id: this.messageId++,
			text: text.trim(),
			type: type || "none",
			timestamp: new Date().toISOString(),
			isLoading: false,
			userName: userName,
			isAgentMessage: type === "agent",
			fadeIn: shouldFadeIn
		};

		console.log("[ConversationStateService] Created message object:", message);
		this.conversation = [...this.conversation, message];
		this.notifyStateChange();
		return message;
	}

	// Update current transcription
	updateCurrentTranscription(transcription) {
		if (!transcription || transcription.trim() === "") return;

		console.log("[ConversationStateService] Updating current transcription:", transcription);

		const currentTranscriptionIndex = this.conversation.findIndex(
			(msg) => msg.type === "current-transcription"
		);

		const transcriptionMessage = {
			id:
				currentTranscriptionIndex >= 0
					? this.conversation[currentTranscriptionIndex].id
					: this.messageId++,
			text: transcription.trim(),
			type: "current-transcription",
			timestamp: new Date().toISOString(),
			isLoading: false,
			userName: "You (typing...)",
			isAgentMessage: false
		};

		console.log("[ConversationStateService] Transcription message:", transcriptionMessage);

		if (currentTranscriptionIndex >= 0) {
			console.log(
				"[ConversationStateService] Updating existing transcription at index:",
				currentTranscriptionIndex
			);
			this.conversation = [
				...this.conversation.slice(0, currentTranscriptionIndex),
				transcriptionMessage,
				...this.conversation.slice(currentTranscriptionIndex + 1)
			];
		} else {
			console.log("[ConversationStateService] Adding new transcription message");
			this.conversation = [...this.conversation, transcriptionMessage];
		}

		this.notifyStateChange();
	}

	// Remove current transcription
	removeCurrentTranscription() {
		console.log("[ConversationStateService] Removing current transcription");
		const beforeCount = this.conversation.length;
		this.conversation = this.conversation.filter((msg) => msg.type !== "current-transcription");
		const afterCount = this.conversation.length;
		console.log(
			"[ConversationStateService] Removed",
			beforeCount - afterCount,
			"transcription messages"
		);
		this.notifyStateChange();
	}

	// Clear conversation
	clearConversation() {
		console.log("[ConversationStateService] Clearing conversation");
		this.conversation = [];
		this.messageId = 0;
		this.notifyStateChange();
	}

	// Get current conversation state
	getConversation() {
		console.log("[ConversationStateService] Getting conversation state");
		return this.conversation;
	}

	// Handle incoming message from server
	handleServerMessage(messageData) {
		console.log("[ConversationStateService] Handling server message:", messageData);

		// Add message to conversation based on message type
		const message = this.addMessage(
			messageData.text,
			messageData.type,
			messageData.userName || (messageData.type === "agent" ? "Agent" : "You"),
			true
		);

		console.log("[ConversationStateService] Added server message to conversation:", message);
		return message;
	}
}
