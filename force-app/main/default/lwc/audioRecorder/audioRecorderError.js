export class AudioRecorderError extends Error {
	constructor(code, message, details = {}) {
		super(message);
		this.name = "AudioRecorderError";
		this.code = code;
		this.details = details;
	}
}

export const ErrorCodes = {
	BROWSER_SUPPORT: "BROWSER_SUPPORT",
	CSP_ERROR: "CSP_ERROR",
	DEVICE_ERROR: "DEVICE_ERROR",
	INITIALIZATION_ERROR: "INITIALIZATION_ERROR",
	NETWORK_ERROR: "NETWORK_ERROR",
	PERMISSION_DENIED: "PERMISSION_DENIED"
};

export const ErrorMessages = {
	[ErrorCodes.BROWSER_SUPPORT]:
		"Speech recognition is not supported in this browser",
	[ErrorCodes.CSP_ERROR]: "Content Security Policy restriction detected",
	[ErrorCodes.DEVICE_ERROR]: "Error accessing audio device",
	[ErrorCodes.INITIALIZATION_ERROR]: "Failed to initialize audio recording",
	[ErrorCodes.NETWORK_ERROR]: "Network connection error occurred",
	[ErrorCodes.PERMISSION_DENIED]: "Microphone access was denied"
};

export const getErrorMessage = (code, isLightning = false) => {
	const baseMessage = ErrorMessages[code] || "An unknown error occurred";

	if (isLightning && code === ErrorCodes.CSP_ERROR) {
		return {
			message: baseMessage,
			steps: [
				"Required Admin Setup:",
				"1. Go to Setup > CSP Trusted Sites",
				"2. Add: https://speech.googleapis.com",
				"3. Context: Lightning Components",
				"4. Enable: Connect-Src and Frame-Src",
				"5. Verify the site is active and properly configured"
			]
		};
	}

	return { message: baseMessage };
};

export const handleNetworkError = (errorCount, isLightning = false) => {
	if (errorCount >= 3) {
		const message = isLightning
			? "Speech recognition service unavailable. Please verify CSP configuration."
			: "Speech recognition service unavailable. Please try again later.";
		return { shouldRetry: false, message };
	}

	const message = navigator.onLine
		? `Network error: Unable to reach speech recognition service. Retrying... (Attempt ${errorCount}/3)`
		: "Network error: Please check your internet connection";

	return { shouldRetry: navigator.onLine, message };
};

export const getRetryDelay = (errorCount) => {
	return Math.min(1000 * Math.pow(2, errorCount - 1), 5000);
};
