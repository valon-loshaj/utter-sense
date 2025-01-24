import { AudioRecorderError, ErrorCodes } from "./audioRecorderError";
import transcribeAudio from "@salesforce/apex/AudioRecorderController.transcribeAudio";
import generateAudio from "@salesforce/apex/AudioRecorderController.generateAudio";

// Debug utility to safely stringify objects
const debugLog = (label, data) => {
	try {
		let logData;
		if (data instanceof Error) {
			logData = {
				message: data.message,
				name: data.name,
				stack: data.stack,
				...(data.details && {
					details: JSON.parse(JSON.stringify(data.details))
				})
			};
		} else if (data instanceof Blob) {
			logData = {
				type: data.type,
				size: data.size
			};
		} else if (typeof data === "object" && data !== null) {
			// Handle both arrays and objects
			logData = JSON.parse(
				JSON.stringify(data, (key, value) => {
					if (value instanceof Blob) {
						return {
							type: value.type,
							size: value.size
						};
					}
					return value;
				})
			);
		} else {
			logData = data;
		}

		console.log(`[WhisperService] ${label}:`, logData);
	} catch (error) {
		console.log(
			`[WhisperService] ${label}: [Unable to stringify data]`,
			typeof data === "object" ? Object.keys(data) : typeof data,
			error
		);
	}
};

export class WhisperService {
	constructor() {
		this.mediaRecorder = null;
		this.audioChunks = [];
		this._isRecording = false;
		this.RECORDING_FORMAT = "audio/webm";
		this.transcriptionInterval = null;
		this.currentTranscription = "";
		this.lastProcessedChunk = 0;
	}

	async initialize() {
		debugLog("Initializing WhisperService", {});
		return true;
	}

	async start(onTranscriptionUpdate, onError) {
		try {
			this._isRecording = true;
			this.audioChunks = [];
			this.currentTranscription = "";
			this.lastProcessedChunk = 0;

			if (!MediaRecorder.isTypeSupported(this.RECORDING_FORMAT)) {
				throw new AudioRecorderError(
					ErrorCodes.BROWSER_SUPPORT,
					"WebM audio format is not supported by your browser"
				);
			}

			const options = {
				mimeType: this.RECORDING_FORMAT,
				audioBitsPerSecond: 128000
			};

			this.mediaRecorder = new MediaRecorder(window.audioStream, options);
			debugLog("MediaRecorder initialized with options", options);

			this.mediaRecorder.ondataavailable = (event) => {
				if (event.data.size > 0) {
					this.audioChunks.push(event.data);
					debugLog("Audio chunk collected", {
						size: event.data.size,
						type: event.data.type
					});
				}
			};

			// Start periodic transcription
			this.transcriptionInterval = setInterval(async () => {
				if (this.audioChunks.length > this.lastProcessedChunk) {
					try {
						const newChunks = this.audioChunks.slice(this.lastProcessedChunk);
						const audioBlob = new Blob(newChunks, {
							type: this.RECORDING_FORMAT
						});

						const base64Audio = await this.blobToBase64(audioBlob);
						const response = await transcribeAudio({
							audioBase64: base64Audio
						});

						if (response && response.text) {
							this.currentTranscription += " " + response.text;
							onTranscriptionUpdate(this.currentTranscription.trim());
						}

						this.lastProcessedChunk = this.audioChunks.length;
					} catch (error) {
						console.error("Real-time transcription error:", error);
						// Continue recording even if transcription fails
					}
				}
			}, 2000); // Process every 2 seconds

			this.mediaRecorder.start(1000); // Collect data in 1-second chunks
		} catch (error) {
			debugLog("Error starting recording", error);
			this._isRecording = false;
			throw new AudioRecorderError(
				ErrorCodes.DEVICE_ERROR,
				"Failed to start recording",
				{ originalError: error }
			);
		}
	}

	async getFinalTranscription() {
		try {
			if (this.audioChunks.length === 0) {
				return "";
			}

			const audioBlob = new Blob(this.audioChunks, {
				type: this.RECORDING_FORMAT
			});

			const base64Audio = await this.blobToBase64(audioBlob);
			const response = await transcribeAudio({
				audioBase64: base64Audio
			});

			return response?.text || "";
		} catch (error) {
			console.error("Final transcription error:", error);
			throw error;
		}
	}

	async generateAudio(input) {
		return await generateAudio({ input });
	}

	blobToBase64(blob) {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onloadend = () => {
				const base64String = reader.result.replace(
					`data:${blob.type};base64,`,
					""
				);
				resolve(base64String);
			};
			reader.onerror = (error) => {
				debugLog("Error converting blob to base64", error);
				reject(error);
			};
			reader.readAsDataURL(blob);
		});
	}

	stop() {
		if (this.mediaRecorder && this._isRecording) {
			this.mediaRecorder.stop();
			this._isRecording = false;
		}
		if (this.transcriptionInterval) {
			clearInterval(this.transcriptionInterval);
			this.transcriptionInterval = null;
		}
	}

	cleanup() {
		this.stop();
		this.audioChunks = [];
		this.mediaRecorder = null;
		this.currentTranscription = "";
		this.lastProcessedChunk = 0;
	}

	isActive() {
		return this._isRecording;
	}
}
