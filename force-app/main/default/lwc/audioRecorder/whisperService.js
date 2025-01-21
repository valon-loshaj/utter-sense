import { AudioRecorderError, ErrorCodes } from "./audioRecorderError";
import transcribeAudio from "@salesforce/apex/WhisperController.transcribeAudio";

export class WhisperService {
	constructor() {
		this.mediaRecorder = null;
		this.audioChunks = [];
		this._isRecording = false;
	}

	async initialize() {
		// No initial setup needed for Whisper
		return true;
	}

	async start(onTranscriptionComplete, onError) {
		try {
			this._isRecording = true;
			this.audioChunks = [];

			// Set up MediaRecorder with audio settings optimal for Whisper
			const options = {
				mimeType: "audio/mp3",
				audioBitsPerSecond: 128000
			};

			// Fallback options if mp3 is not supported
			const mimeTypes = [
				"audio/mp3",
				"audio/mpeg",
				"audio/ogg",
				"audio/wav",
				"audio/webm"
			];

			let selectedMimeType = null;
			for (const mimeType of mimeTypes) {
				if (MediaRecorder.isTypeSupported(mimeType)) {
					selectedMimeType = mimeType;
					break;
				}
			}

			if (!selectedMimeType) {
				throw new AudioRecorderError(
					ErrorCodes.BROWSER_SUPPORT,
					"No supported audio format found"
				);
			}

			options.mimeType = selectedMimeType;
			console.log("Using audio format:", selectedMimeType);

			this.mediaRecorder = new MediaRecorder(window.audioStream, options);

			this.mediaRecorder.ondataavailable = (event) => {
				if (event.data.size > 0) {
					this.audioChunks.push(event.data);
				}
			};

			this.mediaRecorder.onstop = async () => {
				try {
					if (this.audioChunks.length > 0) {
						const audioBlob = new Blob(this.audioChunks, {
							type: selectedMimeType
						});
						await this.sendToWhisper(audioBlob, onTranscriptionComplete);
					}
				} catch (error) {
					onError(error);
				}
			};

			this.mediaRecorder.start(1000); // Collect data in 1-second chunks
		} catch (error) {
			this._isRecording = false;
			throw new AudioRecorderError(
				ErrorCodes.DEVICE_ERROR,
				"Failed to start recording",
				{ originalError: error }
			);
		}
	}

	async sendToWhisper(audioBlob, onTranscriptionComplete) {
		try {
			// Convert blob to base64
			const base64Audio = await this.blobToBase64(audioBlob);

			// Call Apex method to transcribe audio
			const transcription = await transcribeAudio({ audioBase64: base64Audio });

			if (transcription) {
				onTranscriptionComplete(transcription);
			} else {
				throw new Error("No transcription received");
			}
		} catch (error) {
			throw new AudioRecorderError(
				ErrorCodes.NETWORK_ERROR,
				"Failed to get transcription from Whisper API",
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
			reader.onerror = reject;
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
