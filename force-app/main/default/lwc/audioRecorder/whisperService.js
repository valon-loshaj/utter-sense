import { AudioRecorderError, ErrorCodes } from "./audioRecorderError";
import transcribeAudio from "@salesforce/apex/WhisperController.transcribeAudio";

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
	}

	async initialize() {
		debugLog("Initializing WhisperService", {});
		return true;
	}

	async start(onTranscriptionComplete, onError) {
		try {
			this._isRecording = true;
			this.audioChunks = [];

			// Check if webm format is supported
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

			this.mediaRecorder.onstop = async () => {
				try {
					if (this.audioChunks.length > 0) {
						const audioBlob = new Blob(this.audioChunks, {
							type: this.RECORDING_FORMAT
						});
						debugLog("Audio blob created", {
							size: audioBlob.size,
							type: audioBlob.type,
							chunks: this.audioChunks.length
						});

						// check the mediaRecorder.onstop handler to make sure the audioBlob is a webm file
						if (!audioBlob.type.includes("webm")) {
							throw new Error(
								`Invalid audio format: ${audioBlob.type}. Expected audio/webm`
							);
						}

						// Verify the blob is valid
						if (audioBlob.size === 0) {
							throw new Error("Generated audio blob is empty");
						}

						// Convert blob to base64
						const base64Audio = await this.blobToBase64(audioBlob);
						debugLog("Audio converted to base64", {
							base64Length: base64Audio.length,
							originalSize: audioBlob.size
						});

						// Send to server for transcription
						const response = await transcribeAudio({
							audioBase64: base64Audio
						});
						debugLog("Received transcription response", response);

						if (response && response.text) {
							onTranscriptionComplete(response.text);
						} else {
							throw new Error("No transcription text received");
						}
					}
				} catch (error) {
					debugLog("Error in onstop handler", error);
					onError(
						new AudioRecorderError(
							ErrorCodes.PROCESSING_ERROR,
							error.message || "Error processing audio",
							{ originalError: error }
						)
					);
				}
			};

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

	blobToBase64(blob) {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onloadend = () => {
				// Extract base64 data from the result
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
	}

	cleanup() {
		this.stop();
		this.audioChunks = [];
		this.mediaRecorder = null;
	}

	isActive() {
		return this._isRecording;
	}
}
