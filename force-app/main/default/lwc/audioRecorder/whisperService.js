import { AudioRecorderError, ErrorCodes } from './audioRecorderError';
import transcribeAudio from '@salesforce/apex/AudioRecorderController.transcribeAudio';
import generateAudio from '@salesforce/apex/AudioRecorderController.generateAudio';

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
        } else if (typeof data === 'object' && data !== null) {
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
            typeof data === 'object' ? Object.keys(data) : typeof data,
            error
        );
    }
};

// Configuration for audio recording and transcription
const CONFIG = {
    CHUNK_INTERVAL: 1000, // 1 second chunks
    MIN_AUDIO_SIZE: 1024,
    RECORDING_FORMAT: 'audio/webm',
    INITIAL_BUFFER_TIME: 500 // Wait 500ms before starting recording
};

export class WhisperService {
    constructor() {
        this.mediaRecorder = null;
        this.audioChunks = [];
        this._isRecording = false;
        this.RECORDING_FORMAT = CONFIG.RECORDING_FORMAT;
        this.initialBufferTimeout = null;
    }

    async initialize() {
        debugLog('Initializing WhisperService', {});
        return true;
    }

    async start(onError) {
        try {
            this._isRecording = true;
            this.audioChunks = [];

            if (!MediaRecorder.isTypeSupported(this.RECORDING_FORMAT)) {
                throw new AudioRecorderError(
                    ErrorCodes.BROWSER_SUPPORT,
                    'WebM audio format is not supported by your browser'
                );
            }

            const options = {
                mimeType: this.RECORDING_FORMAT,
                audioBitsPerSecond: 256000
            };

            if (!window.audioStream) {
                throw new AudioRecorderError(ErrorCodes.INITIALIZATION_ERROR, 'Audio stream not available');
            }

            this.mediaRecorder = new MediaRecorder(window.audioStream, options);

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };

            // Add initial buffer delay
            this.initialBufferTimeout = setTimeout(() => {
                this.mediaRecorder.start(CONFIG.CHUNK_INTERVAL);
            }, CONFIG.INITIAL_BUFFER_TIME);

            return true;
        } catch (error) {
            this._isRecording = false;
            throw error instanceof AudioRecorderError
                ? error
                : new AudioRecorderError(ErrorCodes.DEVICE_ERROR, 'Failed to start recording', {
                      originalError: error
                  });
        }
    }

    async getFinalTranscription() {
        try {
            if (this.audioChunks.length === 0) {
                return '';
            }

            const audioBlob = new Blob(this.audioChunks, {
                type: this.RECORDING_FORMAT
            });

            const base64Audio = await this.blobToBase64(audioBlob);
            const response = await transcribeAudio({
                audioBase64: base64Audio
            }).catch((error) => {
                throw new AudioRecorderError(ErrorCodes.NETWORK_ERROR, 'Failed to get final transcription', {
                    originalError: error
                });
            });

            return response?.text || '';
        } catch (error) {
            throw error instanceof AudioRecorderError
                ? error
                : new AudioRecorderError(ErrorCodes.DEVICE_ERROR, 'Final transcription error', {
                      originalError: error
                  });
        }
    }

    async generateAudio(input) {
        return await generateAudio({ input });
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
    }

    cleanup() {
        this.stop();
        this.audioChunks = [];
        this.mediaRecorder = null;
    }

    isActive() {
        return this._isRecording;
    }

    // Helper method to convert blob to base64
    async blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64String = reader.result.split(',')[1];
                resolve(base64String);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }
}
