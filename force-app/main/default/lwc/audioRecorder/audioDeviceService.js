import { AudioRecorderError, ErrorCodes } from './audioRecorderError';

const DEBOUNCE_DELAY = 300;

export class AudioDeviceService {
    constructor() {
        this.audioDevices = [];
        this.selectedDeviceId = 'default';
        this.stream = null;
        this.hasPermission = false;
        this._changeTimeout = null;
        this._deviceUpdateTimeout = null;
        this._deviceListeners = new Set();
    }

    // Add device change listener
    addDeviceChangeListener(listener) {
        this._deviceListeners.add(listener);
        if (this._deviceListeners.size === 1) {
            this._setupDeviceChangeListener();
        }
    }

    // Remove device change listener
    removeDeviceChangeListener(listener) {
        this._deviceListeners.delete(listener);
        if (this._deviceListeners.size === 0) {
            this._cleanupDeviceChangeListener();
        }
    }

    // Setup device change monitoring
    _setupDeviceChangeListener() {
        navigator.mediaDevices?.addEventListener('devicechange', this._handleDeviceChange.bind(this));
    }

    // Cleanup device change monitoring
    _cleanupDeviceChangeListener() {
        navigator.mediaDevices?.removeEventListener('devicechange', this._handleDeviceChange.bind(this));
    }

    // Handle device changes with debouncing
    _handleDeviceChange() {
        if (this._deviceUpdateTimeout) {
            clearTimeout(this._deviceUpdateTimeout);
        }

        this._deviceUpdateTimeout = setTimeout(async () => {
            try {
                const devices = await this.getAvailableDevices(false);
                this._deviceListeners.forEach((listener) => {
                    requestAnimationFrame(() => {
                        listener(devices);
                    });
                });
            } catch (error) {
                console.error('Error updating device list:', error);
            }
        }, DEBOUNCE_DELAY);
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

            console.log('Requesting permission with constraints:', constraints);
            const stream = await navigator.mediaDevices.getUserMedia(constraints);

            // Store the stream and mark that we have permission
            this.stream = stream;
            this.hasPermission = true;

            const track = stream.getAudioTracks()[0];
            console.log('Got audio track:', track?.label);

            if (!track) {
                throw new AudioRecorderError(ErrorCodes.DEVICE_ERROR, 'No audio track available');
            }

            // After getting permission, enumerate devices to get their labels
            await this.getAvailableDevices(false);

            return true;
        } catch (error) {
            console.error('Error in initialize:', error);
            if (error.name === 'NotAllowedError') {
                throw new AudioRecorderError(ErrorCodes.PERMISSION_DENIED, 'Microphone access was denied');
            }
            throw new AudioRecorderError(ErrorCodes.DEVICE_ERROR, 'Failed to initialize audio device', {
                originalError: error
            });
        }
    }

    async getAvailableDevices(initializeStream = true) {
        try {
            // If we don't have permission and initialization is requested, get it first
            if (!this.hasPermission && initializeStream) {
                console.log('No permission yet, requesting microphone access...');
                await this.initialize();
                return this.audioDevices; // Return devices found during initialization
            }

            console.log('Enumerating audio devices...');
            const devices = await navigator.mediaDevices.enumerateDevices();
            console.log('All devices found:', devices);

            // Filter and map in one pass for efficiency
            const audioInputs = devices.filter((device) => device.kind === 'audioinput');
            console.log('Audio input devices:', audioInputs);

            // Only update audioDevices if we found some
            if (audioInputs.length > 0) {
                this.audioDevices = audioInputs.map((device) => ({
                    deviceId: device.deviceId,
                    label: device.label || `Microphone ${device.deviceId.slice(0, 4)}`
                }));
            }

            console.log('Final audio devices list:', this.audioDevices);
            return this.audioDevices;
        } catch (error) {
            console.error('Error in getAvailableDevices:', error);
            throw new AudioRecorderError(ErrorCodes.DEVICE_ERROR, 'Failed to enumerate audio devices', {
                originalError: error
            });
        }
    }

    // Debounced device change method
    async changeDevice(deviceId) {
        if (this._changeTimeout) {
            clearTimeout(this._changeTimeout);
        }

        return new Promise((resolve, reject) => {
            this._changeTimeout = setTimeout(async () => {
                try {
                    if (this.stream) {
                        this.stream.getTracks().forEach((track) => track.stop());
                        this.stream = null;
                    }

                    await this.initialize(deviceId);
                    resolve(true);
                } catch (error) {
                    reject(error);
                }
            }, DEBOUNCE_DELAY);
        });
    }

    cleanup() {
        if (this._changeTimeout) {
            clearTimeout(this._changeTimeout);
        }
        if (this._deviceUpdateTimeout) {
            clearTimeout(this._deviceUpdateTimeout);
        }
        this._cleanupDeviceChangeListener();
        this._deviceListeners.clear();
        this.stopStream();
        this.audioDevices = [];
        this.selectedDeviceId = 'default';
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
