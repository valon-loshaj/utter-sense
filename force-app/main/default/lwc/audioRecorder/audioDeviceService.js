import { AudioRecorderError, ErrorCodes } from "./audioRecorderError";

export class AudioDeviceService {
	constructor() {
		this.audioDevices = [];
		this.selectedDeviceId = "default";
		this.stream = null;
	}

	async initialize(deviceId = null) {
		try {
			if (deviceId) {
				this.selectedDeviceId = deviceId;
			}

			const stream = await navigator.mediaDevices.getUserMedia({
				audio: {
					deviceId: this.selectedDeviceId
						? { exact: this.selectedDeviceId }
						: undefined,
					autoGainControl: true,
					echoCancellation: true,
					noiseSuppression: true
				}
			});

			this.stream = stream;
			const track = stream.getAudioTracks()[0];

			if (!track) {
				throw new AudioRecorderError(
					ErrorCodes.DEVICE_ERROR,
					"No audio track available"
				);
			}

			return true;
		} catch (error) {
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
			// Only initialize stream if explicitly requested
			if (initializeStream && !this.stream) {
				await this.initialize();
			}

			const devices = await navigator.mediaDevices.enumerateDevices();
			this.audioDevices = devices
				.filter((device) => device.kind === "audioinput")
				.map((device) => ({
					deviceId: device.deviceId,
					label: device.label || `Microphone ${device.deviceId.slice(0, 4)}`
				}));

			return this.audioDevices;
		} catch (error) {
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
