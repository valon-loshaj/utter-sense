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

// Configuration for audio recording and transcription
const CONFIG = {
	CHUNK_INTERVAL: 1000, // Increased to 1 second to get more substantial chunks
	PROCESS_INTERVAL: 2000, // Process every 2 seconds to allow more context
	MIN_AUDIO_SIZE: 1024, // Keep minimum size the same
	MAX_CHUNKS_PER_PROCESS: 30, // Increased to allow more chunks to be processed
	SLIDING_WINDOW_SIZE: 60, // Increased to maintain 60 seconds of context (with 1s chunks)
	TRANSCRIPTION_BUFFER_SIZE: 20, // Increased buffer size for longer transcriptions
	RECORDING_FORMAT: "audio/webm",
	INITIAL_BUFFER_TIME: 500, // Wait 500ms before starting first transcription
	MIN_INITIAL_CHUNKS: 2 // Minimum number of chunks needed for first transcription
};

export class WhisperService {
	constructor() {
		this.mediaRecorder = null;
		this.audioChunks = [];
		this._isRecording = false;
		this.RECORDING_FORMAT = CONFIG.RECORDING_FORMAT;
		this.transcriptionInterval = null;
		this.currentTranscription = "";
		this.lastProcessedChunk = 0;
		this.transcriptionBuffer = [];
		this.consecutiveEmptyChunks = 0;
		this.isFirstTranscription = true;
		this.initialBufferTimeout = null;
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
			this.transcriptionBuffer = [];
			this.consecutiveEmptyChunks = 0;
			this.isFirstTranscription = true;

			if (!MediaRecorder.isTypeSupported(this.RECORDING_FORMAT)) {
				throw new AudioRecorderError(
					ErrorCodes.BROWSER_SUPPORT,
					"WebM audio format is not supported by your browser"
				);
			}

			const options = {
				mimeType: this.RECORDING_FORMAT,
				audioBitsPerSecond: 256000
			};

			if (!window.audioStream) {
				throw new AudioRecorderError(
					ErrorCodes.INITIALIZATION_ERROR,
					"Audio stream not available"
				);
			}

			this.mediaRecorder = new MediaRecorder(window.audioStream, options);

			this.mediaRecorder.ondataavailable = (event) => {
				if (event.data.size > 0) {
					this.audioChunks.push(event.data);
					this.consecutiveEmptyChunks = 0;
				} else {
					this.consecutiveEmptyChunks++;
				}
			};

			// Start periodic transcription with synchronized intervals
			this.transcriptionInterval = setInterval(async () => {
				if (this.audioChunks.length > this.lastProcessedChunk) {
					try {
						// For first transcription, ensure we have enough audio data
						if (this.isFirstTranscription) {
							if (this.audioChunks.length < CONFIG.MIN_INITIAL_CHUNKS) {
								return; // Wait for more chunks
							}
						}

						// Calculate the window of chunks to process
						const windowStart = Math.max(
							0,
							this.audioChunks.length - CONFIG.SLIDING_WINDOW_SIZE
						);
						const windowEnd = this.audioChunks.length;

						// Get chunks within the sliding window
						const chunksToProcess = this.audioChunks.slice(windowStart, windowEnd);
						const audioBlob = new Blob(chunksToProcess, {
							type: this.RECORDING_FORMAT
						});

						// Only process if we have enough audio data
						if (audioBlob.size >= CONFIG.MIN_AUDIO_SIZE) {
							const base64Audio = await this.blobToBase64(audioBlob);
							const response = await transcribeAudio({
								audioBase64: base64Audio
							}).catch((error) => {
								throw new AudioRecorderError(
									ErrorCodes.NETWORK_ERROR,
									"Failed to transcribe audio",
									{ originalError: error }
								);
							});

							if (response && response.text) {
								const cleanedText = this.cleanTranscriptionText(response.text);

								if (cleanedText) {
									// For first transcription, use the full text
									if (this.isFirstTranscription) {
										this.updateTranscriptionBuffer(cleanedText);
										this.isFirstTranscription = false;
									} else {
										// For subsequent transcriptions, update buffer normally
										this.updateTranscriptionBuffer(cleanedText);
									}

									const stableTranscription = this.getStableTranscription();
									if (stableTranscription) {
										this.currentTranscription = stableTranscription;
										onTranscriptionUpdate(stableTranscription);
									}
								}
							}
						}

						// Update the last processed chunk
						this.lastProcessedChunk = windowEnd;
					} catch (error) {
						if (onError) {
							onError(
								error instanceof AudioRecorderError
									? error
									: new AudioRecorderError(
											ErrorCodes.DEVICE_ERROR,
											"Transcription error occurred",
											{ originalError: error }
										)
							);
						}
						this.lastProcessedChunk = this.audioChunks.length;
					}
				}
			}, CONFIG.PROCESS_INTERVAL);

			// Add initial buffer delay
			this.initialBufferTimeout = setTimeout(() => {
				this.mediaRecorder.start(CONFIG.CHUNK_INTERVAL);
			}, CONFIG.INITIAL_BUFFER_TIME);

			return true;
		} catch (error) {
			this._isRecording = false;
			throw error instanceof AudioRecorderError
				? error
				: new AudioRecorderError(ErrorCodes.DEVICE_ERROR, "Failed to start recording", {
						originalError: error
					});
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
			}).catch((error) => {
				throw new AudioRecorderError(
					ErrorCodes.NETWORK_ERROR,
					"Failed to get final transcription",
					{ originalError: error }
				);
			});

			return response?.text || "";
		} catch (error) {
			throw error instanceof AudioRecorderError
				? error
				: new AudioRecorderError(ErrorCodes.DEVICE_ERROR, "Final transcription error", {
						originalError: error
					});
		}
	}

	async generateAudio(input) {
		return await generateAudio({ input });
	}

	blobToBase64(blob) {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onloadend = () => {
				const base64String = reader.result.replace(`data:${blob.type};base64,`, "");
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
		if (this.initialBufferTimeout) {
			clearTimeout(this.initialBufferTimeout);
			this.initialBufferTimeout = null;
		}
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
		this.transcriptionBuffer = [];
	}

	isActive() {
		return this._isRecording;
	}

	// Add helper method to clean transcription text
	cleanTranscriptionText(text) {
		if (!text) return "";

		// Remove any non-printable characters
		text = text.replace(/[^\x20-\x7E\s]/g, "");

		// Remove multiple spaces
		text = text.replace(/\s+/g, " ");

		// Trim whitespace
		return text.trim();
	}

	// Update transcription buffer with new transcription
	updateTranscriptionBuffer(transcription) {
		this.transcriptionBuffer.push(transcription);
		if (this.transcriptionBuffer.length > CONFIG.TRANSCRIPTION_BUFFER_SIZE) {
			this.transcriptionBuffer.shift();
		}
	}

	// Get stable transcription from buffer using middle-out approach
	getStableTranscription() {
		if (this.transcriptionBuffer.length === 0) return "";

		// Always return the latest transcription for more responsive updates
		return this.transcriptionBuffer[this.transcriptionBuffer.length - 1];
	}
}
