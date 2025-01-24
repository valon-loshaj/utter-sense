import { LightningElement, track, wire } from "lwc";
import { AudioDeviceService } from "./audioDeviceService";
import { WhisperService } from "./whisperService";
import { AgentService } from "./agentService";
import { ShowToastEvent } from "lightning/platformShowToastEvent";
import { getRecord } from "lightning/uiRecordApi";
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

	audioDeviceService;
	whisperService;
	agentService;
	messageId = 0;
	audioElement;

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

			await this.whisperService.start(
				// Real-time transcription update callback
				(transcription) => {
					this.updateCurrentTranscription(transcription);
				},
				// Error callback
				(error) => {
					this.handleError(error);
				}
			);

			this.isRecording = true;
		} catch (error) {
			this.handleError(error);
		}
	}

	async stopRecording() {
		this.isTranscribing = true;
		this.whisperService.stop();
		this.isRecording = false;

		try {
			// Get final transcription
			const finalTranscription =
				await this.whisperService.getFinalTranscription();

			// Add user's final message to conversation
			this.addMessage(finalTranscription, "user");

			// Process agent response
			this.isProcessingAgentResponse = true;
			const response =
				await this.agentService.getAgentResponse(finalTranscription);

			// Generate audio from the agent's response
			try {
				const audioResponse = await this.whisperService.generateAudio(
					response.message
				);
				if (audioResponse && audioResponse.audioUrl) {
					this.playAudioResponse(audioResponse.audioUrl);
				}
			} catch (error) {
				console.error("Error generating audio:", error);
				// Continue with text response even if audio fails
			}

			this.addMessage(response.message, "agent");
		} catch (error) {
			this.handleError(new Error(`Processing error: ${error.message}`));
		} finally {
			this.isProcessingAgentResponse = false;
			this.isTranscribing = false;
		}
	}

	updateCurrentTranscription(transcription) {
		// Update the current transcription in the conversation
		if (
			this.conversation.length > 0 &&
			this.conversation[this.conversation.length - 1].type ===
				"current-transcription"
		) {
			// Update existing transcription message
			this.conversation[this.conversation.length - 1].text = transcription;
		} else {
			// Add new transcription message
			this.conversation = [
				...this.conversation,
				{
					id: this.messageId++,
					text: transcription,
					type: "current-transcription",
					timestamp: new Date().toISOString(),
					isLoading: false,
					userName: `${this.currentUser.data?.fields?.FirstName?.value || "You"} (typing...)`,
					isAgentMessage: false
				}
			];
		}
	}

	addMessage(text, type) {
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
				isAgentMessage: type === "agent"
			}
		];
		this.isTranscribing = false;
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
			this.isPlayingAudio = true;
			this.audioElement.src = audioUrl;
			await this.audioElement.play();
		} catch (error) {
			this.handleError(new Error(`Audio playback error: ${error.message}`));
			this.isPlayingAudio = false;
		}
	}

	get audioIndicatorClass() {
		return this.isPlayingAudio ? "audio-indicator playing" : "audio-indicator";
	}
}
