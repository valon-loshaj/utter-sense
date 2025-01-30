import getAccessToken from "@salesforce/apex/AudioRecorderController.getAccessToken";
import createConversation from "@salesforce/apex/AudioRecorderController.createConversation";
import sendMessage from "@salesforce/apex/AudioRecorderController.sendMessage";

export class MessagingService {
	async initialize() {
		try {
			// First get the access token
			const tokenResponse = await getAccessToken();
			if (tokenResponse.error) {
				throw new Error(tokenResponse.error);
			}

			this.accessToken = tokenResponse.accessToken;

			// Create conversation with the access token
			const conversationResponse = await createConversation({
				accessToken: this.accessToken
			});

			if (conversationResponse.error) {
				console.log("Error creating conversation:", conversationResponse.error);
				throw new Error(conversationResponse.error);
			}

			console.log("Conversation created successfully:", conversationResponse);

			// Store the conversation information
			this.conversationId = conversationResponse.conversationId;

			console.log("Messaging service initialized:", {
				conversationId: this.conversationId
			});

			return true;
		} catch (error) {
			console.error("Failed to initialize messaging service:", error);
			throw error;
		}
	}

	async createConversation() {
		try {
			if (!this.accessToken) {
				throw new Error("Access token not available");
			}

			// Create conversation with the existing access token
			const response = await createConversation({ accessToken: this.accessToken });
			if (response.error) {
				throw new Error(response.error);
			}

			// Store the conversation information
			this.conversationId = response.conversationId;

			return response;
		} catch (error) {
			console.error("Error creating conversation:", error);
			throw error;
		}
	}

	async sendMessage(text) {
		try {
			if (!this.conversationId) {
				throw new Error("Conversation not initialized");
			}

			if (!this.accessToken) {
				throw new Error("Access token not available");
			}

			console.log("Sending message:", {
				conversationId: this.conversationId,
				text: text,
				replyToMessageId: this.lastMessageId
			});

			const response = await sendMessage({
				conversationId: this.conversationId,
				message: text,
				replyToMessageId: "",
				accessToken: this.accessToken
			});

			if (response.error) {
				console.error("Error from sendMessage:", response.error);
				throw new Error(response.error);
			}

			console.log("Message sent successfully:", response);
			this.lastMessageId = "response.messageId";
			return {
				messageId: response.messageId,
				text: response.text
			};
		} catch (error) {
			console.error("Error sending message:", error);
			throw error;
		}
	}

	async refreshToken() {
		try {
			const response = await getAccessToken();
			if (response.error) {
				throw new Error(response.error);
			}

			this.accessToken = response.accessToken;
			this.tokenType = response.tokenType;
			this.tokenExpiry = response.tokenExpiry;

			console.log(
				"Token refreshed successfully, new expiry:",
				new Date(this.tokenExpiry).toISOString()
			);
		} catch (error) {
			console.error("Error refreshing token:", error);
			throw error;
		}
	}

	isTokenExpired() {
		// Add a 30-second buffer to prevent edge cases
		return this.tokenExpiry && Date.now() + 30000 > this.tokenExpiry;
	}
}
