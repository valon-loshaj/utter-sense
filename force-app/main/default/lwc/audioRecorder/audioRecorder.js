import { LightningElement } from "lwc";
import { AudioDeviceService } from "./audioDeviceService";
import { SpeechRecognitionService } from "./speechRecognitionService";
import {
	AudioRecorderError,
	ErrorCodes,
	getErrorMessage,
	handleNetworkError
} from "./audioRecorderError";

export default class AudioRecorder extends LightningElement {
	audioDeviceService;
	speechRecognitionService;
	transcripts = [];
	transcriptId = 0;
	isRecording = false;
	notRecording = true;
	micInitialized = false;

	constructor() {
		super();
		this.audioDeviceService = new AudioDeviceService();
		this.speechRecognitionService = new SpeechRecognitionService();
	}

	get audioDevices() {
		return this.audioDeviceService.audioDevices;
	}

	get selectedDeviceId() {
		return this.audioDeviceService.selectedDeviceId;
	}

	get audioStreamActive() {
		return this.audioDeviceService.isStreamActive();
	}

	addTranscript(text) {
		this.transcripts = [
			...this.transcripts,
			{
				id: this.transcriptId++,
				text: text.trim()
			}
		];
	}

	async initializeRecording() {
		try {
			// Initialize audio devices
			await this.audioDeviceService.initialize();

			// Initialize speech recognition
			await this.speechRecognitionService.initialize();

			this.micInitialized = true;
		} catch (error) {
			console.error("Initialization error:", error);
			const errorInfo = getErrorMessage(
				error.code,
				this.speechRecognitionService.isLightning
			);
			this.addTranscript(errorInfo.message);
			if (errorInfo.steps) {
				errorInfo.steps.forEach((step) => this.addTranscript(step));
			}
			this.micInitialized = false;
		}
	}

	async startRecording() {
		try {
			if (!this.micInitialized) {
				await this.initializeRecording();
			}

			if (!this.micInitialized) {
				throw new AudioRecorderError(
					ErrorCodes.INITIALIZATION_ERROR,
					"Failed to initialize recording"
				);
			}

			// Start speech recognition
			await this.speechRecognitionService.start(
				// Result handler
				(transcript) => {
					this.addTranscript(transcript);
				},
				// Error handler
				(event) => {
					this.handleRecognitionError(event);
				}
			);

			this.isRecording = true;
			this.notRecording = false;
		} catch (error) {
			console.error("Failed to start recording:", error);
			const errorInfo = getErrorMessage(
				error.code,
				this.speechRecognitionService.isLightning
			);
			this.addTranscript(errorInfo.message);
		}
	}

	stopRecording() {
		this.speechRecognitionService.stop();
		this.audioDeviceService.stopStream();
		this.isRecording = false;
		this.notRecording = true;
	}

	async handleDeviceChange(event) {
		const newDeviceId = event.target.value;
		try {
			await this.audioDeviceService.changeDevice(newDeviceId);
			if (this.isRecording) {
				await this.startRecording();
			}
		} catch (error) {
			console.error("Error changing device:", error);
			const errorInfo = getErrorMessage(
				error.code,
				this.speechRecognitionService.isLightning
			);
			this.addTranscript(errorInfo.message);
		}
	}

	handleRecognitionError(event) {
		console.error("Recognition error:", event);

		switch (event.error) {
			case "network":
				const errorCount =
					this.speechRecognitionService.incrementNetworkErrorCount();
				const { shouldRetry, message } = handleNetworkError(
					errorCount,
					this.speechRecognitionService.isLightning
				);
				this.addTranscript(message);
				if (!shouldRetry) {
					this.stopRecording();
				}
				break;

			case "not-allowed":
			case "permission-denied":
				this.addTranscript("Error: Microphone permission denied");
				this.stopRecording();
				break;

			case "no-speech":
				// Don't treat no-speech as an error, just let it restart
				break;

			case "audio-capture":
				this.addTranscript("Error: No microphone detected");
				this.stopRecording();
				break;

			case "aborted":
				// Don't treat aborted as an error if we're stopping intentionally
				if (this.isRecording) {
					this.addTranscript("Recognition was aborted unexpectedly");
				}
				break;

			default:
				this.addTranscript(`Error: ${event.error}`);
				if (this.isRecording) {
					// For unknown errors, stop recording to prevent potential issues
					this.stopRecording();
				}
		}
	}

	handleOnline() {
		if (this.isRecording) {
			this.startRecording();
		}
	}

	handleOffline() {
		this.addTranscript(
			"Network connection lost - Please check your internet connection"
		);
		this.stopRecording();
	}

	async connectedCallback() {
		try {
			await this.audioDeviceService.getAvailableDevices();
			window.addEventListener("online", this.handleOnline.bind(this));
			window.addEventListener("offline", this.handleOffline.bind(this));
		} catch (error) {
			console.error("Error in connectedCallback:", error);
			const errorInfo = getErrorMessage(
				error.code,
				this.speechRecognitionService.isLightning
			);
			this.addTranscript(errorInfo.message);
		}
	}

	disconnectedCallback() {
		this.speechRecognitionService.cleanup();
		this.audioDeviceService.cleanup();
		window.removeEventListener("online", this.handleOnline.bind(this));
		window.removeEventListener("offline", this.handleOffline.bind(this));
	}
}
