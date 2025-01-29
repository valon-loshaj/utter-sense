import getAccessToken from "@salesforce/apex/AudioRecorderController.getAccessToken";
import createConversation from "@salesforce/apex/AudioRecorderController.createConversation";
import sendMessage from "@salesforce/apex/AudioRecorderController.sendMessage";

export class MessagingService {
	async initialize() {
		try {
			// We don't need to get access token separately anymore since it comes with createConversation
			const conversationResponse = await createConversation();

			if (conversationResponse.error) {
				console.log("Error creating conversation:", conversationResponse.error);
				throw new Error(conversationResponse.error);
			}

			console.log("Conversation created successfully:", conversationResponse);

			// Store all the necessary information from the response
			this.conversationId = conversationResponse.conversationId;
			this.lastMessageId = conversationResponse.messageId;
			this.accessToken = conversationResponse.accessToken;
			this.tokenType = conversationResponse.tokenType;
			this.tokenExpiry = conversationResponse.tokenExpiry;

			console.log("Messaging service initialized with token:", {
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
			const response = await createConversation();
			if (response.error) {
				throw new Error(response.error);
			}

			// Store all the information from the response
			this.conversationId = response.conversationId;
			this.lastMessageId = response.messageId;
			this.accessToken = response.accessToken;
			this.tokenType = response.tokenType;
			this.tokenExpiry = response.tokenExpiry;

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

			if (this.isTokenExpired()) {
				console.log("Token expired, getting new token...");
				await this.refreshToken();
			}

			console.log("Sending message:", {
				conversationId: this.conversationId,
				text: text,
				replyToMessageId: this.lastMessageId
			});

			const response = await sendMessage({
				conversationId: this.conversationId,
				message: text,
				replyToMessageId: this.lastMessageId,
				accessToken: this.accessToken
			});

			if (response.error) {
				console.error("Error from sendMessage:", response.error);
				throw new Error(response.error);
			}

			console.log("Message sent successfully:", response);
			this.lastMessageId = response.messageId;
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
