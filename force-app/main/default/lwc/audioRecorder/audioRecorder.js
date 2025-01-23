import { LightningElement, track } from "lwc";
import { AudioDeviceService } from "./audioDeviceService";
import { WhisperService } from "./whisperService";
import { AgentService } from "./agentService";
import { ShowToastEvent } from "lightning/platformShowToastEvent";

export default class AudioRecorder extends LightningElement {
	@track isRecording = false;
	@track isTranscribing = false;
	@track isProcessingAgentResponse = false;
	@track audioDevices = [];
	@track selectedDeviceId = null;
	@track micInitialized = false;
	@track conversation = [];

	audioDeviceService;
	whisperService;
	agentService;
	messageId = 0;

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

			await this.whisperService.start(
				// Success callback for transcription
				async (transcribedMessage) => {
					// Add user message to conversation
					this.addMessage(transcribedMessage, "user");

					// Process agent response
					try {
						this.isProcessingAgentResponse = true;
						const response =
							await this.agentService.getAgentResponse(transcribedMessage);
						this.addMessage(response.message, "agent");
					} catch (error) {
						this.handleError(
							new Error(`Agent response error: ${error.message}`)
						);
					} finally {
						this.isProcessingAgentResponse = false;
					}
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

	stopRecording() {
		this.isTranscribing = true;
		this.whisperService.stop();
		this.isRecording = false;
	}

	addMessage(text, type) {
		this.conversation = [
			...this.conversation,
			{
				id: this.messageId++,
				text: text.trim(),
				type: type || "none",
				timestamp: new Date().toISOString(),
				isLoading: false
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
}
