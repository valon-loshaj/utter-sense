import { LightningElement } from "lwc";

export default class AudioRecorder extends LightningElement {
	mediaRecorder = null;
	audioChunks = [];
	isRecording = false;
	notRecording = true;
	audioURL = "";
	stream = null;
	micInitialized = false;
	mimeTypeSupported = true;
	audioContext = null;
	analyser = null;
	dataArray = null;
	canvasContext = null;
	animationId = null;
	volumeLevel = 0;
	audioInputChecked = false;
	audioStreamActive = false;
	selectedMimeType = null;
	visualizerInitialized = false;
	audioSource = null;
	chunkCheckInterval = null;
	audioDevices = [];
	selectedDeviceId = "default";

	// Method to request microphone access and setup recording
	async initializeRecording() {
		try {
			// Step 1: Audio Input Check - Simplified
			try {
				await this.checkAudioInput();
			} catch (audioInputError) {
				console.error("Audio Input Check Error:", {
					name: audioInputError.name,
					message: audioInputError.message
				});
				throw new Error(
					`Audio Input initialization failed: ${audioInputError.message}`
				);
			}

			// Step 2: MIME Type Selection
			try {
				// Simplify to just the most widely supported formats
				const mimeTypes = ["audio/webm", "audio/webm;codecs=opus"];

				let selectedMimeType = null;

				// More explicit MIME type checking
				try {
					for (const type of mimeTypes) {
						if (MediaRecorder.isTypeSupported(type)) {
							selectedMimeType = type;
							console.log("Found supported MIME type:", type);
							break;
						} else {
							console.log("MIME type not supported:", type);
						}
					}
				} catch (mimeCheckError) {
					console.error("Error checking MIME type support:", mimeCheckError);
				}

				if (!selectedMimeType) {
					this.mimeTypeSupported = false;
					throw new Error("No supported MIME type found");
				}

				// Store the selected MIME type
				this.selectedMimeType = selectedMimeType;
			} catch (mimeError) {
				console.error("MIME Type Selection Error:", {
					name: mimeError.name,
					message: mimeError.message
				});
				throw new Error(`MIME type selection failed: ${mimeError.message}`);
			}

			// Step 3: Stream Initialization
			try {
				const audioConstraints = {
					audio: {
						deviceId: this.selectedDeviceId
							? { exact: this.selectedDeviceId }
							: undefined,
						channelCount: 1,
						echoCancellation: true,
						noiseSuppression: true,
						autoGainControl: true,
						sampleRate: 44100,
						sampleSize: 16
					}
				};

				this.stream =
					await navigator.mediaDevices.getUserMedia(audioConstraints);

				// Verify the stream is active and has audio tracks
				const audioTracks = this.stream.getAudioTracks();
				console.log(
					"Initial audio tracks:",
					audioTracks.map((track) => ({
						label: track.label,
						enabled: track.enabled,
						muted: track.muted,
						readyState: track.readyState,
						settings: track.getSettings()
					}))
				);

				// Ensure track is enabled
				if (audioTracks.length > 0) {
					audioTracks[0].enabled = true;
				}
			} catch (streamError) {
				console.error("Stream Initialization Error:", streamError);
				throw new Error(`Stream initialization failed: ${streamError.message}`);
			}

			// Step 4: Stream Verification
			try {
				if (!this.verifyAudioStream()) {
					throw new Error("Audio stream verification failed");
				}
			} catch (verificationError) {
				console.error("Stream Verification Error:", verificationError);
				throw new Error(
					`Stream verification failed: ${verificationError.message}`
				);
			}

			// Step 5: MediaRecorder Setup
			try {
				if (!this.stream || !this.selectedMimeType) {
					throw new Error("Stream or MIME type not available");
				}

				// Update MediaRecorder initialization with more explicit options
				const options = {
					mimeType: this.selectedMimeType,
					audioBitsPerSecond: 128000,
					bitsPerSecond: 128000
				};

				this.mediaRecorder = new MediaRecorder(this.stream, options);

				// More detailed logging for ondataavailable
				this.mediaRecorder.ondataavailable = async (event) => {
					try {
						if (event.data && event.data.size > 0) {
							// Log more details about the chunk
							const chunk = event.data;
							console.log("Received audio chunk:", {
								size: chunk.size,
								type: chunk.type,
								timestamp: new Date().toISOString(),
								// Log the first few bytes of the chunk
								preview: await this.previewBlobData(chunk)
							});
							this.audioChunks.push(chunk);
						} else {
							console.warn("Received empty audio chunk", {
								data: event.data,
								timestamp: new Date().toISOString()
							});
						}
					} catch (error) {
						console.error("Error in ondataavailable:", error);
					}
				};

				// Add error handler
				this.mediaRecorder.onerror = (error) => {
					console.error("MediaRecorder error:", {
						name: error.name,
						message: error.message,
						error
					});
				};

				console.log("MediaRecorder state:", this.mediaRecorder.state);
				console.log("MediaRecorder mimeType:", this.mediaRecorder.mimeType);

				this.micInitialized = true;

				// Set up event handlers
				this.setupMediaRecorderEvents(this.selectedMimeType);
			} catch (recorderError) {
				console.error("MediaRecorder Setup Error:", recorderError);
				throw new Error(`MediaRecorder setup failed: ${recorderError.message}`);
			}

			// Update volume meter periodically using track settings
			if (this.stream) {
				const track = this.stream.getAudioTracks()[0];
				if (track) {
					setInterval(() => {
						this.updateVolumeMeter(track);
					}, 100);
				}
			}

			// After stream initialization
			if (this.stream) {
				await this.checkAudioLevels();
			}

			// Test the audio setup
			const testResult = await this.testAudioSetup();
			console.log("Audio setup test result:", testResult);

			if (!testResult) {
				console.warn(
					"Audio test recording failed - there might be issues with the recording setup"
				);
			}
		} catch (error) {
			console.error("Initialization Error Details:", {
				name: error.name,
				message: error.message
			});
			// Reset state in case of error
			this.micInitialized = false;
			this.mimeTypeSupported = true;
			if (this.stream) {
				this.stream.getTracks().forEach((track) => track.stop());
				this.stream = null;
			}
			throw error;
		}
	}

	// Move event setup to a separate method for clarity
	setupMediaRecorderEvents(selectedMimeType) {
		if (!this.mediaRecorder) {
			console.error("MediaRecorder not initialized");
			return;
		}

		try {
			this.mediaRecorder.onstop = async () => {
				try {
					console.log(
						"MediaRecorder stopped. Chunks count:",
						this.audioChunks.length
					);

					if (this.audioChunks.length === 0) {
						console.error("No audio chunks recorded");
						return;
					}

					// Create a local copy and verify each chunk
					const chunks = await Promise.all(
						this.audioChunks.map(async (chunk) => {
							console.log("Verifying chunk:", {
								size: chunk.size,
								type: chunk.type,
								preview: await this.previewBlobData(chunk)
							});
							return chunk;
						})
					);

					const audioBlob = new Blob(chunks, {
						type: this.selectedMimeType
					});

					console.log("Created audio blob:", {
						size: audioBlob.size,
						type: audioBlob.type,
						preview: await this.previewBlobData(audioBlob)
					});

					if (audioBlob.size === 0) {
						console.error("Created blob is empty");
						return;
					}

					// Verify the blob can be read
					const reader = new FileReader();
					reader.onload = () => {
						console.log("Blob successfully read:", {
							result: reader.result.slice(0, 50) // Log first 50 chars
						});
						const url = URL.createObjectURL(audioBlob);
						this.audioURL = url;
					};
					reader.onerror = (error) => {
						console.error("Error reading blob:", error);
					};
					reader.readAsDataURL(audioBlob);

					// Clear chunks for next recording
					this.audioChunks = [];
				} catch (stopError) {
					console.error("Error in onstop handler:", stopError);
				}
			};
		} catch (setupError) {
			console.error("Error setting up MediaRecorder events:", setupError);
		}
	}

	// Start recording
	async startRecording() {
		console.log("Start Recording");
		if (this.mediaRecorder && this.mediaRecorder.state === "inactive") {
			// Verify audio setup before starting
			const audioReady = await this.verifyAudioSetup();
			if (!audioReady) {
				console.error("Audio setup verification failed");
				return;
			}

			// Clear previous chunks
			this.audioChunks = [];

			try {
				// Resume audio context
				if (this.audioContext && this.audioContext.state === "suspended") {
					await this.audioContext.resume();
				}

				// Verify stream is active
				const tracks = this.stream.getAudioTracks();
				console.log(
					"Audio tracks before recording:",
					tracks.map((track) => ({
						enabled: track.enabled,
						muted: track.muted,
						readyState: track.readyState,
						settings: track.getSettings()
					}))
				);

				// Start recording with smaller timeslice
				this.mediaRecorder.start(100);

				console.log("Recording started:", {
					state: this.mediaRecorder.state,
					mimeType: this.mediaRecorder.mimeType,
					audioBitsPerSecond: this.mediaRecorder.audioBitsPerSecond
				});

				this.isRecording = true;
				this.notRecording = false;

				// Initialize visualizer after starting recording
				if (!this.visualizerInitialized) {
					await this.initializeAudioVisualizer();
				}
			} catch (error) {
				console.error("Error starting recording:", error);
			}

			// Start a periodic check of audio chunks
			this.chunkCheckInterval = setInterval(() => {
				this.verifyAudioChunks();
			}, 1000);
		}
	}

	// Stop recording
	async stopRecording() {
		console.log("Stop Recording");
		if (this.mediaRecorder && this.mediaRecorder.state === "recording") {
			try {
				// Request final data before stopping
				this.mediaRecorder.requestData();

				// Small delay to ensure we get the final chunk
				await new Promise((resolve) => setTimeout(resolve, 100));

				this.mediaRecorder.stop();
				console.log(
					"Recording stopped. Current chunks:",
					this.audioChunks.map((chunk) => ({
						size: chunk.size,
						type: chunk.type
					}))
				);

				this.isRecording = false;
				this.notRecording = true;
				this.visualizerInitialized = false;
			} catch (error) {
				console.error("Error stopping recording:", error);
			}

			// Clear the interval
			if (this.chunkCheckInterval) {
				clearInterval(this.chunkCheckInterval);
				this.chunkCheckInterval = null;
			}
		}
	}

	// Clean up when component is removed
	disconnectedCallback() {
		console.log("Disconnected Callback");
		if (this.stream) {
			this.stream.getTracks().forEach((track) => track.stop());
		}
		if (this.audioURL) {
			URL.revokeObjectURL(this.audioURL);
		}
		if (this.audioContext) {
			this.audioContext.close();
		}
		if (this.animationId) {
			cancelAnimationFrame(this.animationId);
		}

		// Remove device change listener
		navigator.mediaDevices.removeEventListener(
			"devicechange",
			this.getAudioDevices
		);
	}

	initializeAudioVisualizer() {
		requestAnimationFrame(() => {
			const canvas = this.template.querySelector(".visualizer");
			if (!canvas) {
				console.error("Canvas element not found, retrying...");
				setTimeout(() => this.initializeAudioVisualizer(), 100);
				return;
			}

			canvas.width = 300;
			canvas.height = 100;

			try {
				// Create new audio context if needed
				if (!this.audioContext || this.audioContext.state === "closed") {
					this.audioContext = new (window.AudioContext ||
						window.webkitAudioContext)();
				}

				// Resume the audio context if it's suspended
				if (this.audioContext.state === "suspended") {
					this.audioContext.resume();
				}

				console.log("AudioContext state:", this.audioContext.state);

				// Create and configure analyser node
				this.analyser = this.audioContext.createAnalyser();
				this.analyser.fftSize = 2048;
				this.analyser.smoothingTimeConstant = 0.8;
				this.analyser.minDecibels = -90;
				this.analyser.maxDecibels = -10;

				// Create media stream source
				const source = this.audioContext.createMediaStreamSource(this.stream);

				// Store source to prevent garbage collection
				this.audioSource = source;

				// Connect the nodes
				source.connect(this.analyser);

				const bufferLength = this.analyser.frequencyBinCount;
				this.dataArray = new Uint8Array(bufferLength);

				this.canvasContext = canvas.getContext("2d");

				// Test if we're getting audio data
				this.analyser.getByteTimeDomainData(this.dataArray);
				const hasAudioSignal = this.dataArray.some((value) => value !== 128);
				console.log("Initial audio signal detected:", hasAudioSignal);

				this.visualizerInitialized = true;
				this.visualize();
			} catch (error) {
				console.error("Error initializing audio visualizer:", error);
				this.visualizerInitialized = false;
			}
		});
	}

	visualize() {
		if (!this.isRecording || !this.canvasContext) {
			console.log("Stopping visualization");
			cancelAnimationFrame(this.animationId);
			return;
		}

		try {
			this.analyser.getByteTimeDomainData(this.dataArray);

			// Clear the canvas
			this.canvasContext.fillStyle = "rgb(200, 200, 200)";
			this.canvasContext.fillRect(0, 0, 300, 100);

			// Draw the waveform
			this.canvasContext.lineWidth = 2;
			this.canvasContext.strokeStyle = "rgb(0, 0, 0)";
			this.canvasContext.beginPath();

			const sliceWidth = (300 * 1.0) / this.dataArray.length;
			let x = 0;

			for (let i = 0; i < this.dataArray.length; i++) {
				const v = this.dataArray[i] / 128.0;
				const y = v * 50;

				if (i === 0) {
					this.canvasContext.moveTo(x, y);
				} else {
					this.canvasContext.lineTo(x, y);
				}

				x += sliceWidth;
			}

			this.canvasContext.lineTo(300, 50);
			this.canvasContext.stroke();

			// Schedule next frame
			this.animationId = requestAnimationFrame(() => this.visualize());
		} catch (error) {
			console.error("Error in visualize:", error);
		}
	}

	// Add this method to check audio input
	async checkAudioInput() {
		try {
			// Simplified check - just verify we can get a stream
			const stream = await navigator.mediaDevices.getUserMedia({
				audio: {
					echoCancellation: true,
					noiseSuppression: true,
					autoGainControl: true
				}
			});

			// Test the stream is working
			const track = stream.getAudioTracks()[0];
			if (!track) {
				throw new Error("No audio track available");
			}

			// Log track capabilities
			console.log("Audio Track Settings:", track.getSettings());
			console.log("Audio Track State:", track.readyState);

			// Clean up test stream
			stream.getTracks().forEach((track) => track.stop());

			this.audioInputChecked = true;
			return true;
		} catch (error) {
			console.error("Error in checkAudioInput:", {
				name: error.name,
				message: error.message
			});
			this.audioInputChecked = false;
			throw error;
		}
	}

	// Add this method to verify stream
	verifyAudioStream() {
		if (!this.stream) {
			console.error("No audio stream available");
			return false;
		}

		const audioTrack = this.stream.getAudioTracks()[0];
		if (!audioTrack) {
			console.error("No audio track found in stream");
			return false;
		}

		console.log("Audio Track Settings:", audioTrack.getSettings());
		console.log("Audio Track Constraints:", audioTrack.getConstraints());
		console.log("Audio Track Capabilities:", audioTrack.getCapabilities());

		this.audioStreamActive =
			audioTrack.enabled && audioTrack.readyState === "live";
		return this.audioStreamActive;
	}

	// Update the volume meter without using AudioContext
	updateVolumeMeter(track) {
		if (!track) return;

		// Use track.getSettings() to get volume info
		const settings = track.getSettings();
		if (settings && typeof settings.volume !== "undefined") {
			const level = settings.volume * 100;
			const meter = this.template.querySelector(".volume-meter-fill");
			if (meter) {
				const height = Math.min(100, Math.max(0, level)) + "%";
				meter.style.height = height;
			}
		}
	}

	// Add this method to check audio levels
	checkAudioLevels() {
		if (!this.stream) {
			console.error("No audio stream available");
			return;
		}

		const audioTrack = this.stream.getAudioTracks()[0];
		if (!audioTrack) {
			console.error("No audio track available");
			return;
		}

		// Log track settings
		console.log("Audio Track Settings:", audioTrack.getSettings());

		// Create a temporary audio context to check levels
		const tempContext = new (window.AudioContext ||
			window.webkitAudioContext)();
		const source = tempContext.createMediaStreamSource(this.stream);
		const analyser = tempContext.createAnalyser();

		source.connect(analyser);
		analyser.fftSize = 256;

		const dataArray = new Uint8Array(analyser.frequencyBinCount);

		// Check levels for a brief moment
		const checkLevel = () => {
			analyser.getByteFrequencyData(dataArray);
			const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
			console.log("Current audio level:", average);

			if (average === 0) {
				console.warn("No audio signal detected");
			}
		};

		// Check levels for 2 seconds
		const interval = setInterval(checkLevel, 100);
		setTimeout(() => {
			clearInterval(interval);
			tempContext.close();
		}, 2000);
	}

	// Add this method to test audio setup
	async testAudioSetup() {
		try {
			// Create a test oscillator
			const audioContext = new (window.AudioContext ||
				window.webkitAudioContext)();
			const oscillator = audioContext.createOscillator();
			const gainNode = audioContext.createGain();

			// Create a MediaStreamDestination
			const destination = audioContext.createMediaStreamDestination();

			// Connect the nodes
			oscillator.connect(gainNode);
			gainNode.connect(destination);

			// Set very low volume
			gainNode.gain.value = 0.01;

			// Start the oscillator
			oscillator.start();

			// Create a MediaRecorder with the test stream
			const testRecorder = new MediaRecorder(destination.stream, {
				mimeType: this.selectedMimeType,
				audioBitsPerSecond: 128000
			});

			const testChunks = [];

			return new Promise((resolve, reject) => {
				testRecorder.ondataavailable = (event) => {
					if (event.data.size > 0) {
						testChunks.push(event.data);
					}
				};

				testRecorder.onstop = () => {
					const blob = new Blob(testChunks, { type: this.selectedMimeType });
					console.log("Test recording blob:", {
						size: blob.size,
						type: blob.type
					});

					// Clean up
					oscillator.stop();
					audioContext.close();

					resolve(blob.size > 0);
				};

				// Record for 1 second
				testRecorder.start();
				setTimeout(() => {
					testRecorder.stop();
				}, 1000);
			});
		} catch (error) {
			console.error("Audio test setup failed:", error);
			return false;
		}
	}

	// Add this method to verify audio is working
	async verifyAudioSetup() {
		if (!this.stream || !this.mediaRecorder) {
			console.error("Audio setup not initialized");
			return false;
		}

		const track = this.stream.getAudioTracks()[0];
		if (!track) {
			console.error("No audio track available");
			return false;
		}

		// Test the audio track
		const capabilities = track.getCapabilities();
		const settings = track.getSettings();

		console.log("Audio Track Details:", {
			capabilities,
			settings,
			enabled: track.enabled,
			muted: track.muted,
			readyState: track.readyState,
			label: track.label
		});

		return track.readyState === "live" && track.enabled && !track.muted;
	}

	// Add this method to verify chunks
	verifyAudioChunks() {
		console.log("Current audio chunks state:", {
			length: this.audioChunks.length,
			chunks: this.audioChunks.map((chunk) => ({
				size: chunk.size,
				type: chunk.type
			})),
			totalSize: this.audioChunks.reduce(
				(total, chunk) => total + chunk.size,
				0
			)
		});
	}

	// Add this helper method to preview blob data
	async previewBlobData(blob) {
		try {
			// Read first few bytes of the blob
			const slice = blob.slice(0, 16);
			const buffer = await slice.arrayBuffer();
			const view = new Uint8Array(buffer);
			return Array.from(view)
				.map((b) => b.toString(16).padStart(2, "0"))
				.join(" ");
		} catch (error) {
			console.error("Error previewing blob:", error);
			return "Unable to preview";
		}
	}

	// Add this method to get available audio devices
	async getAudioDevices() {
		try {
			// Request permission first to get labeled devices
			await navigator.mediaDevices
				.getUserMedia({ audio: true })
				.then((stream) => {
					// Stop the stream immediately as we just need it for permission
					stream.getTracks().forEach((track) => track.stop());
				});

			const devices = await navigator.mediaDevices.enumerateDevices();
			const audioInputs = devices
				.filter((device) => device.kind === "audioinput")
				.map((device) => ({
					deviceId: device.deviceId,
					label: device.label || `Microphone ${this.audioDevices.length + 1}`
				}));

			console.log("Available audio devices:", audioInputs);
			this.audioDevices = audioInputs;

			// If no device is selected yet, select the default
			if (!this.selectedDeviceId && audioInputs.length > 0) {
				this.selectedDeviceId = audioInputs[0].deviceId;
			}
		} catch (error) {
			console.error("Error getting audio devices:", error);
		}
	}

	// Add device change handler
	async handleDeviceChange(event) {
		const newDeviceId = event.target.value;
		console.log("Selected device changed to:", newDeviceId);
		this.selectedDeviceId = newDeviceId;

		// If microphone is already initialized, reinitialize with new device
		if (this.micInitialized) {
			await this.reinitializeWithNewDevice();
		}
	}

	// Add method to reinitialize with new device
	async reinitializeWithNewDevice() {
		try {
			// Stop current stream if it exists
			if (this.stream) {
				this.stream.getTracks().forEach((track) => track.stop());
			}

			// Reset state
			this.micInitialized = false;
			this.audioStreamActive = false;
			this.visualizerInitialized = false;

			// Reinitialize with new device
			await this.initializeRecording();
		} catch (error) {
			console.error("Error reinitializing with new device:", error);
		}
	}

	// Add device change listener when component is connected
	async connectedCallback() {
		try {
			// Get initial list of devices
			await this.getAudioDevices();

			// Listen for device changes
			navigator.mediaDevices.addEventListener("devicechange", async () => {
				console.log("Audio devices changed, updating list...");
				await this.getAudioDevices();
			});
		} catch (error) {
			console.error("Error in connectedCallback:", error);
		}
	}
}
