export class MessagingService {
	constructor() {
		this.conversationId = null;
		this.lastMessageId = null;
		this.orgId = "00DdL00000JGsXn";
		this.botDeveloperName = "Utter_Sense_ES";
		this.accessToken = null;
		this.tokenType = null;
		this.tokenExpiry = null;
		this.baseUrl =
			"https://orgfarm-0f131521a0-dev-ed.develop.my.salesforce-scrt.com/iamessage/api/v2";
		this.authUrl =
			"https://orgfarm-0f131521a0-dev-ed.develop.my.salesforce-scrt.com/services/oauth2/token";
	}

	async initialize() {
		try {
			await this.getAccessToken();
			await this.createConversation();
			return true;
		} catch (error) {
			console.error("Failed to initialize messaging service:", error);
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

	async createConversation() {
		try {
			const response = await fetch(`${this.baseUrl}/conversation`, {
				method: "POST",
				headers: {
					Authorization: `${this.tokenType} ${this.accessToken}`,
					"Content-Type": "application/json"
				},
				body: JSON.stringify({
					botDeveloperName: this.botDeveloperName,
					clientType: "UtterSense_AudioRecorder",
					clientVersion: "1.0.0"
				})
			});

			if (!response.ok) {
				throw new Error(`Failed to create conversation: ${response.statusText}`);
			}

			const data = await response.json();
			this.conversationId = data.conversationId;
			this.lastMessageId = data.messageId;
			return data;
		} catch (error) {
			console.error("Error creating conversation:", error);
			throw error;
		}
	}

	async sendMessage(text) {
		try {
			if (this.isTokenExpired()) {
				await this.getAccessToken();
			}

			const response = await fetch(
				`${this.baseUrl}/conversation/${this.conversationId}/message`,
				{
					method: "POST",
					headers: {
						Authorization: `${this.tokenType} ${this.accessToken}`,
						"Content-Type": "application/json"
					},
					body: JSON.stringify({
						text: text,
						replyToMessageId: this.lastMessageId
					})
				}
			);

			if (!response.ok) {
				throw new Error(`Failed to send message: ${response.statusText}`);
			}

			const data = await response.json();
			this.lastMessageId = data.messageId;
			return data;
		} catch (error) {
			console.error("Error sending message:", error);
			throw error;
		}
	}

	isTokenExpired() {
		return this.tokenExpiry && Date.now() > this.tokenExpiry;
	}
}
