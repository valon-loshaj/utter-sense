import { LightningElement, track, wire } from 'lwc';
import { AudioDeviceService } from './audioDeviceService';
import { WhisperService } from './whisperService';
import { MessagingService } from './messagingService';
import { ConversationStateService } from './conversationStateService';
import { SilenceDetectionService } from './silenceDetectionService';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { getRecord } from 'lightning/uiRecordApi';
import EINSTEIN_LOGO from '@salesforce/resourceUrl/UtterSenseEinsteinLogo';
import USER_ID from '@salesforce/user/Id';
import FIRST_NAME_FIELD from '@salesforce/schema/User.FirstName';
import LAST_NAME_FIELD from '@salesforce/schema/User.LastName';

export default class AudioRecorder extends LightningElement {
    @track isRecording = false;
    @track isTranscribing = false;
    @track isProcessingAgentResponse = false;
    @track audioDevices = [];
    @track selectedDeviceId = null;
    @track micInitialized = false;
    @track conversationMessages = [];
    @track isPlayingAudio = false;
    @track currentMessage = null;
    @track silenceDuration = 0;
    @track autoStopEnabled = true;
    @track isManualStop = false;
    @track isAnotherParticipantTyping = false;
    @track typingParticipants = [];

    audioDeviceService;
    whisperService;
    messagingService;
    silenceDetectionService;
    conversationStateService;
    audioElement;
    einsteinLogoUrl = EINSTEIN_LOGO;

    // Add new property to track the conversation container
    conversationContainer;

    @wire(getRecord, {
        recordId: USER_ID,
        fields: [FIRST_NAME_FIELD, LAST_NAME_FIELD]
    })
    currentUser;

    constructor() {
        super();
        this.audioDeviceService = new AudioDeviceService();
        this.whisperService = new WhisperService();
        this.messagingService = new MessagingService();
        this.silenceDetectionService = new SilenceDetectionService();
        this.conversationStateService = new ConversationStateService();

        // Bind conversation state changes to component
        this.conversationStateService.addStateChangeHandler((conversation) => {
            console.log('[AudioRecorder] Conversation state changed:', conversation);
            this.conversationMessages = [...conversation];
            console.log('[AudioRecorder] Updated conversation state:', this.conversationMessages);
        });

        // Bind message handler for server events
        this.messagingService.addMessageHandler((messageData) => {
            this.handleServerMessage(messageData);
        });
    }

    async connectedCallback() {
        try {
            // Only enumerate devices without initializing the stream
            this.audioDevices = await this.audioDeviceService.getAvailableDevices(false);

            // Initialize audio element
            this.audioElement = new Audio();
            this.audioElement.addEventListener('ended', () => {
                this.isPlayingAudio = false;
            });

            // Initialize the conversation container reference
            this.conversationContainer = this.template.querySelector('.conversation-container');
        } catch (error) {
            this.handleError(error);
        }
    }

    // New method to handle device selection
    handleDeviceChange(event) {
        this.selectedDeviceId = event.target.value;
    }

    async initializeRecording() {
        try {
            if (!this.selectedDeviceId) {
                throw new Error('Please select a microphone device first');
            }

            await this.audioDeviceService.initialize(this.selectedDeviceId);
            await this.whisperService.initialize();
            await this.messagingService.initialize();

            // Initialize messaging service and store conversation details
            this.micInitialized = true;

            // Add system message through conversation state service
            this.conversationStateService.addMessage('Conversation initialized successfully', 'system', 'System', true);

            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'Success',
                    message: 'Recording initialized successfully',
                    variant: 'success'
                })
            );
        } catch (error) {
            this.handleError(error);
            // If there's an error with messaging service, we should clean up
            this.cleanup();
        }
    }

    // Add a cleanup method
    cleanup() {
        this.micInitialized = false;
        this.isRecording = false;
        this.isProcessingAgentResponse = false;
        this.whisperService.cleanup();
        this.audioDeviceService.cleanup();
        this.silenceDetectionService.cleanup();
        this.messagingService.cleanup();
        this.conversationStateService.clearConversation();
        if (this.audioElement) {
            this.audioElement.pause();
            this.audioElement.src = '';
        }
    }

    async startRecording() {
        this.isManualStop = false;
        try {
            // Check if the microphone is initialized
            if (!this.micInitialized) {
                throw new Error('Please initialize the microphone first');
            }

            // Re-enable auto-stop when starting a new recording
            this.autoStopEnabled = true;

            // Clean up any existing transcription bubbles first
            this.conversationStateService.removeCurrentTranscription();

            // Share the audio stream with the WhisperService
            window.audioStream = this.audioDeviceService.stream;

            // Initialize and start silence detection
            await this.silenceDetectionService.initialize(this.audioDeviceService.stream, {
                onSilenceDetected: () => this.handleSilenceDetected(),
                onSilenceProgress: (duration) => this.handleSilenceProgress(duration)
            });
            this.silenceDetectionService.start();

            // Reset current transcription
            this.conversationStateService.removeCurrentTranscription();

            // Set recording state and loading state
            this.isRecording = true;
            this.isProcessingAgentResponse = false;

            console.log('Starting whisper service with real-time transcription...');
            await this.whisperService.start(
                // Real-time transcription update callback
                (transcription) => {
                    console.log('Received real-time transcription:', transcription);
                    this.conversationStateService.updateCurrentTranscription(transcription);
                },
                // Error callback
                (error) => {
                    console.error('Real-time transcription error:', error);
                    this.handleError(error);
                }
            );

            console.log('Recording started successfully');
        } catch (error) {
            this.handleError(error);
            this.isRecording = false;
        }
    }

    async stopRecording() {
        if (this.isManualStop) {
            this.isManualStop = false;
            return;
        }

        try {
            // Stop silence detection
            this.silenceDetectionService.stop();

            // Stop recording first
            this.whisperService.stop();
            this.isRecording = false;

            // Remove current transcription with fade out
            this.conversationStateService.removeCurrentTranscription();

            // Get final transcription
            const finalTranscription = await this.whisperService.getFinalTranscription();

            // Only proceed if we have a valid transcription
            if (finalTranscription && finalTranscription.trim()) {
                // Start processing agent response
                this.isProcessingAgentResponse = true;

                try {
                    console.log('Sending message to agent:', finalTranscription);
                    const response = await this.messagingService.sendMessage(finalTranscription);
                    console.log('Message sent successfully, waiting for response through events:', response);
                } catch (error) {
                    console.error('Error in message processing:', error);
                    this.handleError(error);
                    this.conversationStateService.addMessage(
                        'Failed to process message. Please try again.',
                        'system',
                        'System',
                        true
                    );
                } finally {
                    this.isProcessingAgentResponse = false;
                }
            }
        } catch (error) {
            this.handleError(error);
            this.isProcessingAgentResponse = false;
        } finally {
            // Only auto-restart if it's not a manual stop and auto-stop is enabled
            if (!this.isManualStop && this.autoStopEnabled) {
                setTimeout(() => {
                    if (!this.isRecording) {
                        this.startRecording();
                    }
                }, 1000);
            }
        }
    }

    // Add method to scroll to latest message
    scrollToLatestMessage() {
        // Get the conversation container
        const container = this.template.querySelector('.conversation-container');
        if (container) {
            // Use requestAnimationFrame for smooth scrolling
            requestAnimationFrame(() => {
                container.scrollTo({
                    top: container.scrollHeight,
                    behavior: 'smooth'
                });
            });
        }
    }

    // Handle incoming server messages
    async handleServerMessage(messageData) {
        console.log('[AudioRecorder] Handling server message:', messageData);
        try {
            switch (messageData.type) {
                case 'message':
                    // Handle regular message
                    await this.handleIncomingMessage(messageData);
                    break;
                case 'typing_started':
                    // Handle typing started
                    this.handleTypingIndicator(messageData);
                    break;
                case 'typing_stopped':
                    // Handle typing stopped
                    this.handleTypingIndicator(messageData);
                    break;
                case 'participant':
                    // Handle participant changes
                    this.handleParticipantChange(messageData);
                    break;
                case 'close':
                    // Handle conversation close
                    this.handleConversationClose(messageData);
                    break;
                default:
                    console.log('[AudioRecorder] Unhandled message type:', messageData.type);
            }
        } catch (error) {
            console.error('[AudioRecorder] Error in handleServerMessage:', error);
            this.handleError(error);
        }
    }

    async handleIncomingMessage(messageData) {
        console.log('[AudioRecorder] Processing incoming message:', messageData);

        // Add message to conversation through state service
        const message = this.conversationStateService.handleServerMessage(messageData);
        console.log('[AudioRecorder] Created message:', message);

        // If no message was created, return early
        if (!message) {
            console.warn('[AudioRecorder] No message created from server message');
            return;
        }

        // Handle audio generation if it's an agent message
        if (message.isAgentMessage && message.text) {
            try {
                console.log('[AudioRecorder] Generating audio for response:', message.text);
                const audioResponse = await this.whisperService.generateAudio(message.text);

                if (audioResponse && audioResponse.audioBase64) {
                    const audioBlob = this.base64ToBlob(audioResponse.audioBase64, 'audio/mp3');
                    const audioUrl = URL.createObjectURL(audioBlob);
                    await this.playAudioResponse(audioUrl);
                }
            } catch (audioError) {
                console.error('[AudioRecorder] Error generating audio:', audioError);
                this.handleError(new Error('Audio generation failed, but message was received'));
            }
        }

        // Scroll to the latest message
        this.scrollToLatestMessage();
    }

    handleTypingIndicator(messageData) {
        const { actor, type } = messageData;

        if (!actor || !actor.actorName) {
            console.warn('Missing actor information in typing indicator event');
            return;
        }

        if (type === 'typing_started') {
            // Add to typing participants if not already present
            if (!this.typingParticipants.some((p) => p.name === actor.actorName)) {
                this.typingParticipants = [
                    ...this.typingParticipants,
                    {
                        name: actor.actorName,
                        role: actor.role,
                        timestamp: messageData.timestamp
                    }
                ];
            }
        } else {
            // Remove from typing participants
            this.typingParticipants = this.typingParticipants.filter((p) => p.name !== actor.actorName);
        }

        // Update the typing indicator visibility
        this.isAnotherParticipantTyping = this.typingParticipants.length > 0;
    }

    handleParticipantChange(messageData) {
        const { actor, operation } = messageData;

        if (!actor || !actor.actorName) {
            console.warn('Missing actor information in participant event');
            return;
        }

        // Add system message for participant changes
        let message = '';
        if (operation === 'add') {
            message = `${actor.actorName} joined the conversation`;
        } else if (operation === 'remove') {
            message = `${actor.actorName} left the conversation`;
            // Also remove from typing participants if they were typing
            this.typingParticipants = this.typingParticipants.filter((p) => p.name !== actor.actorName);
            this.isAnotherParticipantTyping = this.typingParticipants.length > 0;
        }

        if (message) {
            this.conversationStateService.addMessage(message, 'system', 'System', true);
        }
    }

    handleConversationClose(messageData) {
        // Clear typing indicators
        this.typingParticipants = [];
        this.isAnotherParticipantTyping = false;

        // Add system message
        this.conversationStateService.addMessage(messageData.text || 'Conversation closed', 'system', 'System', true);
    }

    handleError(error) {
        console.error('Error:', error);
        this.dispatchEvent(
            new ShowToastEvent({
                title: 'Error',
                message: error.message || 'An unknown error occurred',
                variant: 'error'
            })
        );
        this.isTranscribing = false;
        this.isRecording = false;
    }

    disconnectedCallback() {
        this.whisperService.cleanup();
        this.audioDeviceService.cleanup();
        this.silenceDetectionService.cleanup();
        this.messagingService.cleanup();
        this.conversationStateService.clearConversation();
        if (this.audioElement) {
            this.audioElement.pause();
            this.audioElement.src = '';
        }
    }

    // Add getter for record button label
    get recordButtonLabel() {
        return this.isRecording ? 'Conversation in progress...' : 'Start Conversation';
    }

    // Existing getter for disabling record button
    get notRecording() {
        return this.isRecording || !this.micInitialized;
    }

    // Add getter for stop button disabled state
    get stopButtonDisabled() {
        return !this.isRecording;
    }

    // Add new method to handle audio playback
    async playAudioResponse(audioUrl) {
        try {
            console.log('Starting audio playback with URL:', audioUrl);
            this.isPlayingAudio = true;
            this.audioElement.src = audioUrl;

            // Remove any existing event listeners
            this.audioElement.removeEventListener('ended', this.handleAudioEnded);

            // Add event listeners for debugging and auto-restart
            this.audioElement.addEventListener('canplay', () => console.log('Audio can play'));
            this.audioElement.addEventListener('error', (e) => console.error('Audio error:', e));

            // Add event listener for audio completion
            this.audioElement.addEventListener('ended', () => {
                console.log('Audio playback completed');
                this.isPlayingAudio = false;
                // Only auto-restart if auto-stop is enabled
                if (this.autoStopEnabled) {
                    console.log('Auto-restart enabled, starting new recording...');
                    setTimeout(() => {
                        if (!this.isRecording) {
                            this.startRecording();
                        }
                    }, 1000);
                } else {
                    console.log('Auto-restart disabled, ending conversation');
                }
            });

            await this.audioElement.play();
            console.log('Audio playback started successfully');
        } catch (error) {
            console.error('Audio playback error:', error);
            this.handleError(new Error(`Audio playback error: ${error.message}`));
            this.isPlayingAudio = false;
        }
    }

    get audioIndicatorClass() {
        return this.isPlayingAudio ? 'audio-indicator playing' : 'audio-indicator';
    }

    handleMessageClass(message) {
        this.currentMessage = message;
        return this.messageClasses;
    }

    get messageClasses() {
        if (!this.currentMessage) return 'message';

        const classes = ['message'];
        if (this.currentMessage.fadeIn) classes.push('fade-in');
        if (this.currentMessage.fadeOut) classes.push('fade-out');
        return classes.join(' ');
    }

    // Add base64ToBlob helper method
    base64ToBlob(base64, type = 'audio/mp3') {
        const byteCharacters = atob(base64);
        const byteArrays = [];

        for (let offset = 0; offset < byteCharacters.length; offset += 512) {
            const slice = byteCharacters.slice(offset, offset + 512);
            const byteNumbers = new Array(slice.length);

            for (let i = 0; i < slice.length; i++) {
                byteNumbers[i] = slice.charCodeAt(i);
            }

            const byteArray = new Uint8Array(byteNumbers);
            byteArrays.push(byteArray);
        }

        return new Blob(byteArrays, { type });
    }

    // New methods for silence detection
    handleSilenceDetected() {
        if (this.isRecording && this.autoStopEnabled) {
            this.stopRecording();
        }
    }

    handleSilenceProgress(duration) {
        this.silenceDuration = duration;
    }

    // New getters for silence detection UI
    get silenceIndicatorClass() {
        return `silence-indicator ${this.silenceDuration > 0 ? 'active' : ''}`;
    }

    get silenceProgressStyle() {
        const progress = (this.silenceDuration / 2.5) * 100; // Changed from 5 to 2.5 seconds
        return `transform: scale(${1 - progress / 100})`;
    }

    get silenceCountdown() {
        if (this.silenceDuration === 0) return '';
        const remaining = Math.max(0, 2.5 - this.silenceDuration).toFixed(1); // Changed from 5 to 2.5 seconds
        return remaining;
    }

    // Modify the stop button click handler
    handleStopClick() {
        this.isManualStop = true;
        this.autoStopEnabled = false;

        // Stop all ongoing processes
        this.silenceDetectionService.stop();
        this.whisperService.stop();
        this.isRecording = false;
        this.isProcessingAgentResponse = false;

        // Stop audio playback if it's playing
        if (this.isPlayingAudio && this.audioElement) {
            this.audioElement.pause();
            this.audioElement.src = '';
            this.isPlayingAudio = false;
        }

        // Clean up any ongoing transcription messages
        this.conversationStateService.removeCurrentTranscription();

        // Add a message indicating the conversation was stopped
        this.conversationStateService.addMessage('Conversation stopped by user', 'system', 'System', true);
    }

    get getMessageClass() {
        const message = this.currentMessage;
        if (!message) return 'message';

        const classes = ['message'];
        if (message.type === 'user') classes.push('outgoing');
        if (message.type === 'agent') classes.push('incoming');
        if (message.type === 'system') classes.push('system');
        if (message.fadeIn) classes.push('fade-in');
        if (message.fadeOut) classes.push('fade-out');
        return classes.join(' ');
    }

    get getMessageBubbleClass() {
        const message = this.currentMessage;
        if (!message) return 'message-bubble';

        const classes = ['message-bubble'];
        if (message.type === 'user') classes.push('outgoing');
        if (message.type === 'agent') classes.push('incoming');
        if (message.type === 'system') classes.push('system');
        return classes.join(' ');
    }

    // Use only a getter for conversation that returns the tracked property
    get conversation() {
        console.log('[AudioRecorder] Accessing conversation:', this.conversationMessages);
        return this.conversationMessages;
    }
}
