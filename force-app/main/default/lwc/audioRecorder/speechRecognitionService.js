import { AudioRecorderError, ErrorCodes } from "./audioRecorderError";

export class SpeechRecognitionService {
	constructor() {
		this.isLightning = window.location.hostname.includes(
			".lightning.force.com"
		);
		this.recognition = null;
		this._networkErrorCount = 0;
		this._recognitionActive = false;
		this._retryTimeout = null;
	}

	async initialize() {
		try {
			// Log available APIs
			const apis = {
				speechRecognitionList:
					"SpeechGrammarList" in window || "webkitSpeechGrammarList" in window,
				standard: "SpeechRecognition" in window,
				webkit: "webkitSpeechRecognition" in window
			};
			console.log("Available Speech Recognition APIs:", apis);

			let SpeechRecognition;
			if ("webkitSpeechRecognition" in window) {
				SpeechRecognition = window.webkitSpeechRecognition;
			} else if ("SpeechRecognition" in window) {
				SpeechRecognition = window.SpeechRecognition;
			} else {
				throw new AudioRecorderError(
					ErrorCodes.BROWSER_SUPPORT,
					"Speech recognition not supported in this browser"
				);
			}

			this.recognition = new SpeechRecognition();
			await this.configureRecognition();

			return true;
		} catch (error) {
			if (error instanceof AudioRecorderError) {
				throw error;
			}
			throw new AudioRecorderError(
				ErrorCodes.INITIALIZATION_ERROR,
				"Failed to initialize speech recognition",
				{ originalError: error }
			);
		}
	}

	async configureRecognition() {
		if (!this.recognition) {
			throw new AudioRecorderError(
				ErrorCodes.INITIALIZATION_ERROR,
				"Recognition not initialized"
			);
		}

		// Configure recognition settings
		this.recognition.continuous = true;
		this.recognition.interimResults = true;
		this.recognition.lang = "en-US";
		this.recognition.maxAlternatives = 1;

		// Force HTTPS for service URI in Lightning
		if (this.isLightning && this.recognition.serviceURI) {
			this.recognition.serviceURI = this.recognition.serviceURI.replace(
				"http:",
				"https:"
			);
		}
	}

	async start(onResult, onError) {
		if (!this.recognition) {
			throw new AudioRecorderError(
				ErrorCodes.INITIALIZATION_ERROR,
				"Recognition not initialized"
			);
		}

		if (this._recognitionActive) {
			return;
		}

		if (!navigator.onLine) {
			throw new AudioRecorderError(
				ErrorCodes.NETWORK_ERROR,
				"No network connection"
			);
		}

		return new Promise((resolve, reject) => {
			const onStartSuccess = () => {
				this._recognitionActive = true;
				this.recognition.removeEventListener("start", onStartSuccess);
				this.recognition.removeEventListener("error", onStartError);
				resolve();
			};

			const onStartError = (event) => {
				this.recognition.removeEventListener("start", onStartSuccess);
				this.recognition.removeEventListener("error", onStartError);
				reject(
					new AudioRecorderError(ErrorCodes.INITIALIZATION_ERROR, event.error)
				);
			};

			// Set up event listeners
			this.setupEventListeners(onResult, onError);

			// Start recognition
			this.recognition.addEventListener("start", onStartSuccess, {
				once: true
			});
			this.recognition.addEventListener("error", onStartError, { once: true });
			this.recognition.start();
		});
	}

	setupEventListeners(onResult, onError) {
		// Result handler
		this.recognition.onresult = (event) => {
			try {
				const results = Array.from(event.results);
				const lastResult = results[results.length - 1];

				if (lastResult && lastResult[0]) {
					const transcript = lastResult[0].transcript;
					if (lastResult.isFinal && transcript.trim()) {
						onResult(transcript.trim());
					}
				}
			} catch (error) {
				console.error("Error processing speech result:", error);
			}
		};

		// Error handler
		this.recognition.onerror = (event) => {
			onError(event);
		};

		// End handler
		this.recognition.onend = () => {
			this._recognitionActive = false;

			// Only attempt to restart if we're still supposed to be recording
			if (
				this._shouldRestart &&
				navigator.onLine &&
				this._networkErrorCount < 3
			) {
				if (this._retryTimeout) {
					clearTimeout(this._retryTimeout);
				}
				const delay = Math.min(
					1000 * Math.pow(2, this._networkErrorCount - 1),
					5000
				);
				this._retryTimeout = setTimeout(() => {
					if (this._shouldRestart) {
						this.start(onResult, onError);
					}
				}, delay);
			}
		};
	}

	cleanup() {
		this.stop();
		if (this.recognition) {
			this.recognition = null;
		}
	}

	getNetworkErrorCount() {
		return this._networkErrorCount;
	}

	incrementNetworkErrorCount() {
		return ++this._networkErrorCount;
	}

	isActive() {
		return this._recognitionActive;
	}

	stop() {
		this._shouldRestart = false;
		if (this._retryTimeout) {
			clearTimeout(this._retryTimeout);
			this._retryTimeout = null;
		}

		if (this.recognition && this._recognitionActive) {
			this.recognition.stop();
		}

		this._recognitionActive = false;
		this._networkErrorCount = 0;
	}
}
