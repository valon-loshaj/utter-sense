import { LightningElement, track, wire } from "lwc";
import { AudioDeviceService } from "./audioDeviceService";
import { WhisperService } from "./whisperService";
import { MessagingService } from "./messagingService";
import { ShowToastEvent } from "lightning/platformShowToastEvent";
import { getRecord } from "lightning/uiRecordApi";
import { SilenceDetectionService } from "./silenceDetectionService";
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
	@track silenceDuration = 0;
	@track autoStopEnabled = true;
	@track isManualStop = false;

	audioDeviceService;
	whisperService;
	messagingService;
	silenceDetectionService;
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
		this.messagingService = new MessagingService();
		this.silenceDetectionService = new SilenceDetectionService();
	}

	async connectedCallback() {
		try {
			// Only enumerate devices without initializing the stream
			this.audioDevices = await this.audioDeviceService.getAvailableDevices(false);

			// Initialize audio element
			this.audioElement = new Audio();
			this.audioElement.addEventListener("ended", () => {
				this.isPlayingAudio = false;
			});

			// Initialize the conversation container reference
			this.conversationContainer = this.template.querySelector(".conversation-container");
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
			await this.messagingService.initialize();

			// Create a new conversation
			const conversationResponse = await this.messagingService.createConversation();
			this.conversationId = conversationResponse.conversationId;

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
		this.isManualStop = false;
		try {
			if (!this.micInitialized) {
				throw new Error("Please initialize the microphone first");
			}

			// Re-enable auto-stop when starting a new recording
			this.autoStopEnabled = true;

			// Clean up any existing transcription bubbles first
			this.conversation = this.conversation.filter(
				(msg) => msg.type !== "current-transcription"
			);

			// Share the audio stream with the WhisperService
			window.audioStream = this.audioDeviceService.stream;

			// Initialize and start silence detection
			await this.silenceDetectionService.initialize(this.audioDeviceService.stream, {
				onSilenceDetected: () => this.handleSilenceDetected(),
				onSilenceProgress: (duration) => this.handleSilenceProgress(duration)
			});
			this.silenceDetectionService.start();

			// Reset current transcription
			this.currentTranscription = "";

			// Set recording state and loading state
			this.isRecording = true;
			this.isProcessingAgentResponse = false;

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
		if (this.isManualStop) {
			this.isManualStop = false;
			return;
		}

		try {
			// Stop silence detection
			this.silenceDetectionService.stop();

			// Stop recording first
			this.whisperService.stop();
			this.isRecording = false;

			// Remove any existing real-time transcription bubble immediately
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

			// Clean up the conversation by removing any transcription messages
			this.conversation = this.conversation.filter(
				(msg) => msg.type !== "current-transcription"
			);

			// Get final transcription
			const finalTranscription = await this.whisperService.getFinalTranscription();

			// Only proceed if we have a valid transcription
			if (finalTranscription && finalTranscription.trim()) {
				// Create a new conversation array without transcription messages and add the final message
				const cleanedConversation = this.conversation.filter(
					(msg) => msg.type !== "current-transcription"
				);

				this.conversation = cleanedConversation;

				// Add user's final message to conversation with fade in
				this.addMessage(finalTranscription, "user", true);

				// Start processing agent response
				this.isProcessingAgentResponse = true;

				// Send message to bot and get response
				console.log("Sending message to agent:", finalTranscription);
				const response = await this.messagingService.sendMessage(finalTranscription);

				console.log("Received response from agent:", response);

				const botResponse = {
					text: response.text,
					messageId: response.messageId
				};

				// Generate audio from the bot's response
				try {
					console.log("Generating audio for response:", botResponse.text);
					const audioResponse = await this.whisperService.generateAudio(botResponse.text);
					console.log("Audio response received:", audioResponse);

					if (audioResponse && audioResponse.audioBase64) {
						const audioBlob = this.base64ToBlob(audioResponse.audioBase64, "audio/mp3");
						const audioUrl = URL.createObjectURL(audioBlob);
						console.log("Created audio URL:", audioUrl);
						this.playAudioResponse(audioUrl);
					}
				} catch (error) {
					console.error("Error generating audio:", error);
					// If audio generation fails, still show the message and restart recording
					setTimeout(() => {
						if (!this.isRecording) {
							this.startRecording();
						}
					}, 1000);
				}

				// One final cleanup before adding agent response
				this.conversation = this.conversation.filter(
					(msg) => msg.type !== "current-transcription"
				);

				// Add agent response with fade in
				this.addMessage(botResponse.text, "agent", true);
				this.isProcessingAgentResponse = false;
			} else {
				// If no valid transcription, just restart recording
				console.log("No valid transcription, restarting recording...");
				setTimeout(() => {
					if (!this.isRecording) {
						this.startRecording();
					}
				}, 1000);
			}
		} catch (error) {
			this.handleError(error);
			this.isProcessingAgentResponse = false;
			// Only auto-restart if it's not a manual stop
			if (!this.isManualStop && this.autoStopEnabled) {
				setTimeout(() => {
					if (!this.isRecording) {
						this.startRecording();
					}
				}, 1000);
			}
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
				: type === "system"
					? "System"
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
		this.silenceDetectionService.cleanup();
		if (this.audioElement) {
			this.audioElement.pause();
			this.audioElement.src = "";
		}
	}

	// Add getter for record button label
	get recordButtonLabel() {
		return this.isRecording ? "Conversation in progress..." : "Start Conversation";
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

			// Remove any existing event listeners
			this.audioElement.removeEventListener("ended", this.handleAudioEnded);

			// Add event listeners for debugging and auto-restart
			this.audioElement.addEventListener("canplay", () => console.log("Audio can play"));
			this.audioElement.addEventListener("error", (e) => console.error("Audio error:", e));

			// Add event listener for audio completion
			this.audioElement.addEventListener("ended", () => {
				console.log("Audio playback completed");
				this.isPlayingAudio = false;
				// Only auto-restart if auto-stop is enabled
				if (this.autoStopEnabled) {
					console.log("Auto-restart enabled, starting new recording...");
					setTimeout(() => {
						if (!this.isRecording) {
							this.startRecording();
						}
					}, 1000);
				} else {
					console.log("Auto-restart disabled, ending conversation");
				}
			});

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

	// New methods for silence detection
	handleSilenceDetected() {
		if (this.isRecording && this.autoStopEnabled) {
			this.stopRecording();
		}
	}

	handleSilenceProgress(duration) {
		this.silenceDuration = duration;
	}

	// New getters for silence detection UI
	get silenceIndicatorClass() {
		return `silence-indicator ${this.silenceDuration > 0 ? "active" : ""}`;
	}

	get silenceProgressStyle() {
		const progress = (this.silenceDuration / 5) * 100; // 8 seconds is our threshold
		return `transform: scale(${1 - progress / 100})`;
	}

	get silenceCountdown() {
		if (this.silenceDuration === 0) return "";
		const remaining = Math.max(0, 5 - this.silenceDuration).toFixed(1);
		return remaining;
	}

	// Modify the stop button click handler
	handleStopClick() {
		this.isManualStop = true;
		this.autoStopEnabled = false;

		// Stop all ongoing processes
		this.silenceDetectionService.stop();
		this.whisperService.stop();
		this.isRecording = false;
		this.isProcessingAgentResponse = false;

		// Stop audio playback if it's playing
		if (this.isPlayingAudio && this.audioElement) {
			this.audioElement.pause();
			this.audioElement.src = "";
			this.isPlayingAudio = false;
		}

		// Clean up any ongoing transcription messages
		this.conversation = this.conversation.filter((msg) => msg.type !== "current-transcription");

		// Add a message indicating the conversation was stopped
		this.addMessage("Conversation stopped by user", "system", true);
	}
}
