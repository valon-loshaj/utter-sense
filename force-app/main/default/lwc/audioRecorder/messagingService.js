import getAccessToken from "@salesforce/apex/AudioRecorderController.getAccessToken";
import createConversation from "@salesforce/apex/AudioRecorderController.createConversation";
import sendMessage from "@salesforce/apex/AudioRecorderController.sendMessage";

export class MessagingService {
	async initialize() {
		try {
			const accessTokenResponse = await getAccessToken();
			const newConversationResponse = await createConversation();

			if (accessTokenResponse.error) {
				console.log("Error getting access token:", accessTokenResponse.error);
				throw new Error(accessTokenResponse.error);
			}

			if (newConversationResponse.error) {
				console.log("Error creating conversation:", newConversationResponse.error);
				throw new Error(newConversationResponse.error);
			}

			console.log("Conversation created successfully:", newConversationResponse);

			this.conversationId = newConversationResponse.conversationId;
			this.lastMessageId = newConversationResponse.messageId;
			this.accessToken = accessTokenResponse.accessToken;
			this.tokenType = accessTokenResponse.tokenType;
			this.tokenExpiry = accessTokenResponse.tokenExpiry;
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
			this.conversationId = response.conversationId;
			this.lastMessageId = response.messageId;
			return response;
		} catch (error) {
			console.error("Error creating conversation:", error);
			throw error;
		}
	}

	async getAccessToken() {
		try {
			const response = await fetch(this.authUrl, {
				method: "POST",
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
					Accept: "application/json",
					"X-Requested-With": "XMLHttpRequest",
					Origin: window.location.origin
				},
				credentials: "include",
				mode: "cors",
				body: new URLSearchParams({
					grant_type: "client_credentials",
					client_id: this.orgId,
					client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
					scope: "api messaging_api"
				})
			});

			if (!response.ok) {
				const errorText = await response.text();
				console.error("Token response error:", {
					status: response.status,
					statusText: response.statusText,
					headers: Object.fromEntries(response.headers.entries()),
					error: errorText
				});
				throw new Error(
					`Failed to get access token: ${response.statusText}. Details: ${errorText}`
				);
			}

			const data = await response.json();
			this.accessToken = data.access_token;
			this.tokenType = data.token_type;
			this.tokenExpiry = Date.now() + data.expires_in * 1000;

			return data;
		} catch (error) {
			console.error("Error getting access token:", error);
			throw error;
		}
	}

	async sendMessage(text) {
		try {
			if (!this.conversationId) {
				throw new Error("Conversation not initialized");
			}

			console.log("Sending message:", {
				conversationId: this.conversationId,
				text: text,
				replyToMessageId: this.lastMessageId
			});

			const response = await sendMessage({
				conversationId: this.conversationId,
				message: text,
				replyToMessageId: this.lastMessageId
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

	isTokenExpired() {
		return this.tokenExpiry && Date.now() > this.tokenExpiry;
	}
}
