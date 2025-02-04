export class SilenceDetectionService {
    constructor() {
        this.audioContext = null;
        this.analyser = null;
        this.mediaStreamSource = null;
        this.silenceThreshold = -65; // Lowered from -50 to -65 dB to require more silence
        this.silenceTimer = null;
        this.silenceDuration = 0;
        this.silenceCallback = null;
        this.silenceStartTime = null;
        this.isActive = false;
        this.onSilenceProgress = null;
        this.CONFIG = {
            maxSilentTime: 3.0, // Increased from 2.5s to 3.0s for more natural pauses
            debounceTime: 300, // Increased from 150ms to 300ms to prevent quick fluctuations
            minSilenceTime: 0.5, // Increased from 0.1s to 0.5s to require longer silence
            smoothingFactor: 0.15 // Decreased from 0.2 to 0.15 for smoother transitions
        };
        this.lastSoundTime = null;
        this.smoothedDuration = 0;
    }

    async initialize(stream, options = {}) {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.analyser = this.audioContext.createAnalyser();
        this.mediaStreamSource = this.audioContext.createMediaStreamSource(stream);
        this.mediaStreamSource.connect(this.analyser);

        // Configure analyser
        this.analyser.fftSize = 2048;
        this.analyser.smoothingTimeConstant = 0.8;

        this.silenceThreshold = options.silenceThreshold || this.silenceThreshold;
        this.silenceCallback = options.onSilenceDetected;
        this.onSilenceProgress = options.onSilenceProgress;

        // Reset timing variables
        this.lastSoundTime = null;
        this.smoothedDuration = 0;
    }

    start() {
        if (this.isActive) return;
        this.isActive = true;
        this.silenceDuration = 0;
        this.silenceStartTime = null;
        this.lastSoundTime = null;
        this.smoothedDuration = 0;
        this.checkAudioLevel();
    }

    stop() {
        this.isActive = false;
        if (this.silenceTimer) {
            clearTimeout(this.silenceTimer);
            this.silenceTimer = null;
        }
        this.silenceDuration = 0;
        this.silenceStartTime = null;
        this.lastSoundTime = null;
        this.smoothedDuration = 0;
    }

    cleanup() {
        this.stop();
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
        this.analyser = null;
        this.mediaStreamSource = null;
    }

    checkAudioLevel() {
        if (!this.isActive) return;

        const dataArray = new Float32Array(this.analyser.frequencyBinCount);
        this.analyser.getFloatTimeDomainData(dataArray);

        // Calculate RMS value
        let rms = 0;
        for (let i = 0; i < dataArray.length; i++) {
            rms += dataArray[i] * dataArray[i];
        }
        rms = Math.sqrt(rms / dataArray.length);

        // Convert to dB
        const db = 20 * Math.log10(rms);
        const now = Date.now();

        if (db < this.silenceThreshold) {
            // If we detect silence
            if (!this.silenceStartTime) {
                this.silenceStartTime = now;
            }

            // Calculate raw duration
            const rawDuration = (now - this.silenceStartTime) / 1000;

            // Only update if we've passed the minimum silence time
            if (rawDuration >= this.CONFIG.minSilenceTime) {
                // Smooth the duration updates
                this.smoothedDuration =
                    this.smoothedDuration === 0
                        ? rawDuration
                        : this.smoothedDuration + (rawDuration - this.smoothedDuration) * this.CONFIG.smoothingFactor;

                if (this.onSilenceProgress) {
                    this.onSilenceProgress(this.smoothedDuration);
                }

                if (this.smoothedDuration >= this.CONFIG.maxSilentTime) {
                    if (this.silenceCallback) {
                        this.silenceCallback();
                    }
                    return;
                }
            }
        } else {
            // Sound detected
            if (this.lastSoundTime === null || now - this.lastSoundTime >= this.CONFIG.debounceTime) {
                // Only reset if we haven't heard sound for the debounce period
                this.silenceStartTime = null;
                this.smoothedDuration = 0;
                if (this.onSilenceProgress) {
                    this.onSilenceProgress(0);
                }
            }
            this.lastSoundTime = now;
        }

        // Schedule next check
        requestAnimationFrame(() => this.checkAudioLevel());
    }
}
