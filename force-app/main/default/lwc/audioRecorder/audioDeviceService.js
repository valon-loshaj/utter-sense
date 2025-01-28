import { AudioRecorderError, ErrorCodes } from "./audioRecorderError";

export class AudioDeviceService {
	constructor() {
		this.audioDevices = [];
		this.selectedDeviceId = "default";
		this.stream = null;
		this.hasPermission = false;
	}

	async initialize(deviceId = null) {
		try {
			if (deviceId) {
				this.selectedDeviceId = deviceId;
			}

			// Always request permission first with default device
			const constraints = {
				audio: {
					deviceId: this.selectedDeviceId ? { exact: this.selectedDeviceId } : undefined,
					autoGainControl: true,
					echoCancellation: true,
					noiseSuppression: true
				}
			};

			console.log("Requesting permission with constraints:", constraints);
			const stream = await navigator.mediaDevices.getUserMedia(constraints);

			// Store the stream and mark that we have permission
			this.stream = stream;
			this.hasPermission = true;

			const track = stream.getAudioTracks()[0];
			console.log("Got audio track:", track?.label);

			if (!track) {
				throw new AudioRecorderError(ErrorCodes.DEVICE_ERROR, "No audio track available");
			}

			// After getting permission, enumerate devices to get their labels
			await this.getAvailableDevices(false);

			return true;
		} catch (error) {
			console.error("Error in initialize:", error);
			if (error.name === "NotAllowedError") {
				throw new AudioRecorderError(
					ErrorCodes.PERMISSION_DENIED,
					"Microphone access was denied"
				);
			}
			throw new AudioRecorderError(
				ErrorCodes.DEVICE_ERROR,
				"Failed to initialize audio device",
				{ originalError: error }
			);
		}
	}

	async getAvailableDevices(initializeStream = true) {
		try {
			// If we don't have permission and initialization is requested, get it first
			if (!this.hasPermission && initializeStream) {
				console.log("No permission yet, requesting microphone access...");
				await this.initialize();
				return this.audioDevices; // Return devices found during initialization
			}

			console.log("Enumerating audio devices...");
			const devices = await navigator.mediaDevices.enumerateDevices();
			console.log("All devices found:", devices);

			// Filter and map in one pass for efficiency
			const audioInputs = devices.filter((device) => device.kind === "audioinput");
			console.log("Audio input devices:", audioInputs);

			// Only update audioDevices if we found some
			if (audioInputs.length > 0) {
				this.audioDevices = audioInputs.map((device) => ({
					deviceId: device.deviceId,
					label: device.label || `Microphone ${device.deviceId.slice(0, 4)}`
				}));
			}

			console.log("Final audio devices list:", this.audioDevices);
			return this.audioDevices;
		} catch (error) {
			console.error("Error in getAvailableDevices:", error);
			throw new AudioRecorderError(
				ErrorCodes.DEVICE_ERROR,
				"Failed to enumerate audio devices",
				{ originalError: error }
			);
		}
	}

	async changeDevice(deviceId) {
		if (this.stream) {
			this.stream.getTracks().forEach((track) => track.stop());
			this.stream = null;
		}

		await this.initialize(deviceId);
	}

	cleanup() {
		this.stopStream();
		this.audioDevices = [];
		this.selectedDeviceId = "default";
	}

	isStreamActive() {
		return Boolean(this.stream?.active);
	}

	stopStream() {
		if (this.stream) {
			this.stream.getTracks().forEach((track) => {
				track.stop();
			});
			this.stream = null;
		}
	}
}
