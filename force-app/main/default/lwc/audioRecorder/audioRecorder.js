import { LightningElement, track, wire } from "lwc";
import { AudioDeviceService } from "./audioDeviceService";
import { WhisperService } from "./whisperService";
import { AgentService } from "./agentService";
import { ShowToastEvent } from "lightning/platformShowToastEvent";
import { getRecord } from "lightning/uiRecordApi";
import EINSTEIN_LOGO from "@salesforce/resourceUrl/UtterSenseEinsteinLogo";
import USER_ID from "@salesforce/user/Id";
import FIRST_NAME_FIELD from "@salesforce/schema/User.FirstName";
import LAST_NAME_FIELD from "@salesforce/schema/User.LastName";

export default class AudioRecorder extends LightningElement {
	@track isRecording = false;
	@track isTranscribing = false;
	@track isProcessingAgentResponse = false;
	@track audioDevices = [];
	@track selectedDeviceId = null;
	@track micInitialized = false;
	@track conversation = [];
	@track isPlayingAudio = false;
	@track currentMessage = null;

	audioDeviceService;
	whisperService;
	agentService;
	messageId = 0;
	audioElement;
	einsteinLogoUrl = EINSTEIN_LOGO;

	// Add new property to track the conversation container
	conversationContainer;

	@wire(getRecord, {
		recordId: USER_ID,
		fields: [FIRST_NAME_FIELD, LAST_NAME_FIELD]
	})
	currentUser;

	constructor() {
		super();
		this.audioDeviceService = new AudioDeviceService();
		this.whisperService = new WhisperService();
		this.agentService = new AgentService();
	}

	async connectedCallback() {
		try {
			// Only enumerate devices without initializing the stream
			this.audioDevices =
				await this.audioDeviceService.getAvailableDevices(false);

			// Initialize audio element
			this.audioElement = new Audio();
			this.audioElement.addEventListener("ended", () => {
				this.isPlayingAudio = false;
			});

			// Initialize the conversation container reference
			this.conversationContainer = this.template.querySelector(
				".conversation-container"
			);
		} catch (error) {
			this.handleError(error);
		}
	}

	// New method to handle device selection
	handleDeviceChange(event) {
		this.selectedDeviceId = event.target.value;
	}

	async initializeRecording() {
		try {
			if (!this.selectedDeviceId) {
				throw new Error("Please select a microphone device first");
			}

			await this.audioDeviceService.initialize(this.selectedDeviceId);
			await this.whisperService.initialize();
			this.micInitialized = true;

			this.dispatchEvent(
				new ShowToastEvent({
					title: "Success",
					message: "Recording initialized successfully",
					variant: "success"
				})
			);
		} catch (error) {
			this.handleError(error);
		}
	}

	async startRecording() {
		try {
			if (!this.micInitialized) {
				throw new Error("Please initialize the microphone first");
			}

			// Share the audio stream with the WhisperService
			window.audioStream = this.audioDeviceService.stream;

			// Reset current transcription
			this.currentTranscription = "";

			// Set recording state and loading state
			this.isRecording = true;
			this.isProcessingAgentResponse = false; // Ensure agent processing is off

			console.log("Starting whisper service with real-time transcription...");
			await this.whisperService.start(
				// Real-time transcription update callback
				(transcription) => {
					console.log("Received real-time transcription:", transcription);
					this.updateCurrentTranscription(transcription);
				},
				// Error callback
				(error) => {
					console.error("Real-time transcription error:", error);
					this.handleError(error);
				}
			);

			console.log("Recording started successfully");
		} catch (error) {
			this.handleError(error);
			this.isRecording = false;
		}
	}

	async stopRecording() {
		try {
			// Stop recording first
			this.whisperService.stop();
			this.isRecording = false;

			// Remove the real-time transcription bubble with fade out effect
			const currentTranscriptionMessage = this.conversation.find(
				(msg) => msg.type === "current-transcription"
			);

			if (currentTranscriptionMessage) {
				currentTranscriptionMessage.fadeOut = true;
				// Force a re-render to show the fade out
				this.conversation = [...this.conversation];

				// Wait for fade out animation
				await new Promise((resolve) => setTimeout(resolve, 300));
			}

			// Remove the real-time transcription bubble
			this.conversation = this.conversation.filter(
				(msg) => msg.type !== "current-transcription"
			);

			// Get final transcription
			const finalTranscription =
				await this.whisperService.getFinalTranscription();

			// Add user's final message to conversation with fade in
			this.addMessage(finalTranscription, "user", true);

			// Start processing agent response
			this.isProcessingAgentResponse = true;
			const response =
				await this.agentService.getAgentResponse(finalTranscription);

			// Generate audio from the agent's response
			try {
				console.log("Generating audio for response:", response.message);
				const audioResponse = await this.whisperService.generateAudio(
					response.message
				);
				console.log("Audio response received:", audioResponse);

				if (audioResponse && audioResponse.audioBase64) {
					const audioBlob = this.base64ToBlob(
						audioResponse.audioBase64,
						"audio/mp3"
					);
					const audioUrl = URL.createObjectURL(audioBlob);
					console.log("Created audio URL:", audioUrl);
					this.playAudioResponse(audioUrl);
				}
			} catch (error) {
				console.error("Error generating audio:", error);
			}

			// Add agent response with fade in
			this.addMessage(response.message, "agent", true);
			this.isProcessingAgentResponse = false;
		} catch (error) {
			this.handleError(error);
			this.isProcessingAgentResponse = false;
		}
	}

	// Add method to scroll to latest message
	scrollToLatestMessage() {
		// Get the conversation container
		const container = this.template.querySelector(".conversation-container");
		if (container) {
			// Use requestAnimationFrame for smooth scrolling
			requestAnimationFrame(() => {
				container.scrollTo({
					top: container.scrollHeight,
					behavior: "smooth"
				});
			});
		}
	}

	updateCurrentTranscription(transcription) {
		if (!transcription || transcription.trim() === "") return;

		console.log("Updating current transcription:", transcription);

		// Update the current transcription in the conversation
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
			userName: `${this.currentUser.data?.fields?.FirstName?.value || "You"} (typing...)`,
			isAgentMessage: false
		};

		if (currentTranscriptionIndex >= 0) {
			// Update existing transcription
			this.conversation = [
				...this.conversation.slice(0, currentTranscriptionIndex),
				transcriptionMessage,
				...this.conversation.slice(currentTranscriptionIndex + 1)
			];
		} else {
			// Add new transcription message
			this.conversation = [...this.conversation, transcriptionMessage];
		}

		// Scroll to the latest message
		this.scrollToLatestMessage();

		console.log("Updated conversation:", this.conversation);
	}

	addMessage(text, type, shouldFadeIn = false) {
		const userName =
			type === "user"
				? `${this.currentUser.data?.fields?.FirstName?.value || "You"}`
				: "Agent";

		this.conversation = [
			...this.conversation,
			{
				id: this.messageId++,
				text: text.trim(),
				type: type || "none",
				timestamp: new Date().toISOString(),
				isLoading: false,
				userName: userName,
				isAgentMessage: type === "agent",
				fadeIn: shouldFadeIn
			}
		];
		this.isTranscribing = false;

		// Scroll to the latest message
		this.scrollToLatestMessage();
	}

	// Add a method to handle conversation updates
	renderedCallback() {
		if (this.conversation.length > 0) {
			this.scrollToLatestMessage();
		}
	}

	handleError(error) {
		console.error("Error:", error);
		this.dispatchEvent(
			new ShowToastEvent({
				title: "Error",
				message: error.message || "An unknown error occurred",
				variant: "error"
			})
		);
		this.isTranscribing = false;
		this.isRecording = false;
	}

	disconnectedCallback() {
		this.whisperService.cleanup();
		this.audioDeviceService.cleanup();
		if (this.audioElement) {
			this.audioElement.pause();
			this.audioElement.src = "";
		}
	}

	// Add getter for record button label
	get recordButtonLabel() {
		return this.isRecording ? "Recording..." : "Start Recording";
	}

	// Existing getter for disabling record button
	get notRecording() {
		return this.isRecording || !this.micInitialized;
	}

	// Add getter for stop button disabled state
	get stopButtonDisabled() {
		return !this.isRecording;
	}

	// Add new method to handle audio playback
	async playAudioResponse(audioUrl) {
		try {
			console.log("Starting audio playback with URL:", audioUrl);
			this.isPlayingAudio = true;
			this.audioElement.src = audioUrl;

			// Add event listeners for debugging
			this.audioElement.addEventListener("canplay", () =>
				console.log("Audio can play")
			);
			this.audioElement.addEventListener("error", (e) =>
				console.error("Audio error:", e)
			);

			await this.audioElement.play();
			console.log("Audio playback started successfully");
		} catch (error) {
			console.error("Audio playback error:", error);
			this.handleError(new Error(`Audio playback error: ${error.message}`));
			this.isPlayingAudio = false;
		}
	}

	get audioIndicatorClass() {
		return this.isPlayingAudio ? "audio-indicator playing" : "audio-indicator";
	}

	handleMessageClass(message) {
		this.currentMessage = message;
		return this.messageClasses;
	}

	get messageClasses() {
		if (!this.currentMessage) return "message";

		const classes = ["message"];
		if (this.currentMessage.fadeIn) classes.push("fade-in");
		if (this.currentMessage.fadeOut) classes.push("fade-out");
		return classes.join(" ");
	}

	// Add base64ToBlob helper method
	base64ToBlob(base64, type = "audio/mp3") {
		const byteCharacters = atob(base64);
		const byteArrays = [];

		for (let offset = 0; offset < byteCharacters.length; offset += 512) {
			const slice = byteCharacters.slice(offset, offset + 512);
			const byteNumbers = new Array(slice.length);

			for (let i = 0; i < slice.length; i++) {
				byteNumbers[i] = slice.charCodeAt(i);
			}

			const byteArray = new Uint8Array(byteNumbers);
			byteArrays.push(byteArray);
		}

		return new Blob(byteArrays, { type });
	}
}
