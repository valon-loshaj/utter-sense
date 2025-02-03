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
            // 1. Stop silence detection
            this.silenceDetectionService.stop();

            // 2. Stop recording and mark state
            this.whisperService.stop();
            this.isRecording = false;

            // 3. Remove current transcription with fade out
            await new Promise((resolve) => {
                this.conversationStateService.removeCurrentTranscription();
                // Wait for fade out animation
                setTimeout(resolve, 300);
            });

            // 4. Get final transcription
            const finalTranscription = await this.whisperService.getFinalTranscription();

            // Only proceed if we have a valid transcription
            if (finalTranscription && finalTranscription.trim()) {
                // 5. Start processing state
                this.isProcessingAgentResponse = true;

                try {
                    // 6. Send message to messaging service
                    console.log('Sending message to agent:', finalTranscription);
                    await this.messagingService.sendMessage(finalTranscription);
                    console.log('Message sent successfully, waiting for response through events');

                    // 7. Wait for agent response and audio playback
                    // Note: The actual message handling is done in handleIncomingMessage
                    // We don't auto-restart recording here anymore as it will be handled
                    // after audio playback completes
                } catch (error) {
                    console.error('Error in message processing:', error);
                    this.handleError(error);
                    this.conversationStateService.addMessage(
                        'Failed to process message. Please try again.',
                        'system',
                        'System',
                        true
                    );
                    // If there's an error, we can restart recording
                    this.handleConversationContinuation();
                } finally {
                    this.isProcessingAgentResponse = false;
                }
            } else {
                // If no valid transcription, we can restart recording
                this.handleConversationContinuation();
            }
        } catch (error) {
            this.handleError(error);
            this.isProcessingAgentResponse = false;
            this.handleConversationContinuation();
        }
    }

    // New method to handle conversation continuation
    handleConversationContinuation() {
        if (!this.isManualStop && this.autoStopEnabled && !this.isPlayingAudio) {
            setTimeout(() => {
                if (!this.isRecording) {
                    this.startRecording();
                }
            }, 1000);
        }
    }

    // Update scrollToLatestMessage to work with reversed layout
    scrollToLatestMessage() {
        // Get the conversation container
        const container = this.template.querySelector('.conversation-container');
        if (container) {
            // In a reversed layout, new messages are at the top, so scroll to 0
            container.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        }
    }

    // Handle incoming server messages
    async handleServerMessage(messageData) {
        console.log('[AudioRecorder] Handling server message:', JSON.stringify(messageData, null, 2));

        try {
            // Handle direct message data (for participant and typing events)
            if (messageData.type && messageData.actor) {
                switch (messageData.type) {
                    case 'participant':
                        this.handleParticipantChange(messageData);
                        return;
                    case 'typing_started':
                    case 'typing_stopped':
                        this.handleTypingIndicator(messageData);
                        return;
                }
            }

            // Handle routing events directly
            if (messageData.type === 'routing' && messageData.data?.conversationEntry) {
                const entry = messageData.data.conversationEntry;
                const entryPayload = JSON.parse(entry.entryPayload);

                if (entryPayload.entryType === 'RoutingResult') {
                    this.handleRoutingEvent({
                        routingType: entryPayload.routingType,
                        failureType: entryPayload.failureType,
                        failureReason: entryPayload.failureReason,
                        actor: {
                            actorName: entry.senderDisplayName,
                            role: entry.sender.role,
                            appType: entry.sender.appType
                        },
                        timestamp: new Date().toISOString()
                    });
                    return;
                }
            }

            // Handle both nested and flat message structures
            let eventType, eventData;

            if (messageData.data?.type && messageData.data?.data) {
                // Nested structure
                eventType = messageData.data.type;
                eventData = messageData.data.data;
            } else if (messageData.conversationEntry) {
                // Flat structure
                eventType = 'message'; // Default to message type for flat structure
                eventData = messageData;
            } else {
                console.warn('[AudioRecorder] Invalid message data structure:', JSON.stringify(messageData, null, 2));
                return;
            }

            if (!eventData.conversationEntry) {
                console.warn('[AudioRecorder] Missing conversation entry in data:', JSON.stringify(eventData, null, 2));
                return;
            }

            console.log('[AudioRecorder] Processing event type:', eventType);
            console.log('[AudioRecorder] Event data:', JSON.stringify(eventData, null, 2));

            const entry = eventData.conversationEntry;
            const entryPayload = JSON.parse(entry.entryPayload);
            console.log('[AudioRecorder] Parsed entry payload:', JSON.stringify(entryPayload, null, 2));

            // Handle message events
            if (eventType === 'message' && entryPayload.entryType === 'Message') {
                const processedData = {
                    type: eventType,
                    data: eventData,
                    timestamp: messageData.data?.timestamp || new Date().toISOString(),
                    content: entryPayload.abstractMessage?.staticContent?.text,
                    sender: entry.sender,
                    actor: {
                        actorName: entry.senderDisplayName,
                        role: entry.sender.role,
                        appType: entry.sender.appType
                    }
                };
                await this.handleIncomingMessage(processedData);
            }
        } catch (error) {
            console.error('[AudioRecorder] Error processing server message. Error details:', {
                name: error.name,
                message: error.message,
                stack: error.stack,
                data: JSON.stringify(messageData, null, 2)
            });
            this.handleError(error);
        }
    }

    async handleIncomingMessage(messageData) {
        console.log('[AudioRecorder] Processing incoming message:', JSON.stringify(messageData, null, 2));

        try {
            // Check if this is a user message (final transcription)
            const isUserMessage = messageData.data?.conversationEntry?.sender?.role === 'EndUser';

            // If it's a user message, remove any existing preview messages
            if (isUserMessage) {
                this.conversationMessages = this.conversationMessages.filter((msg) => msg.type !== 'preview');
                this.currentTranscription = null;
            }

            // Structure the message data
            const serverMessage = {
                data: JSON.stringify({
                    conversationId: messageData.data.conversationId,
                    conversationEntry: {
                        identifier: messageData.data.conversationEntry.identifier,
                        entryType: 'Message',
                        entryPayload: messageData.data.conversationEntry.entryPayload,
                        sender: messageData.data.conversationEntry.sender,
                        senderDisplayName: messageData.data.conversationEntry.senderDisplayName,
                        transcriptedTimestamp: messageData.data.conversationEntry.transcriptedTimestamp
                    }
                })
            };

            // Add message to conversation through state service
            const message = this.conversationStateService.handleServerMessage(serverMessage);

            if (!message) {
                console.warn('[AudioRecorder] No message created from server message');
                return;
            }

            // Handle audio generation if it's an agent message
            if (message.isAgentMessage && message.text) {
                try {
                    // Ensure we're not recording during audio playback
                    if (this.isRecording) {
                        this.whisperService.stop();
                        this.isRecording = false;
                    }

                    console.log('[AudioRecorder] Generating audio for response:', message.text);
                    const audioResponse = await this.whisperService.generateAudio(message.text);

                    if (audioResponse && audioResponse.audioBase64) {
                        const audioBlob = this.base64ToBlob(audioResponse.audioBase64, 'audio/mp3');
                        const audioUrl = URL.createObjectURL(audioBlob);
                        // Wait for audio playback to complete before continuing
                        await this.playAudioResponse(audioUrl);
                    }
                } catch (audioError) {
                    console.error('[AudioRecorder] Error generating audio:', audioError);
                    this.handleError(new Error('Audio generation failed, but message was received'));
                    // Even if audio fails, try to continue the conversation
                    this.handleConversationContinuation();
                }
            }

            // Scroll to the latest message
            this.scrollToLatestMessage();
        } catch (error) {
            console.error('[AudioRecorder] Error handling incoming message:', error);
            this.handleError(error);
            this.handleConversationContinuation();
        }
    }

    handleTypingIndicator(messageData) {
        console.log('[AudioRecorder] Handling typing indicator:', JSON.stringify(messageData, null, 2));

        const { actor, type } = messageData;
        if (!actor || !actor.actorName) {
            console.warn('[AudioRecorder] Missing actor information in typing indicator event');
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
                        timestamp: new Date().toISOString()
                    }
                ];
            }
        } else {
            // Remove from typing participants
            this.typingParticipants = this.typingParticipants.filter((p) => p.name !== actor.actorName);
        }

        // Update the typing indicator visibility
        this.isAnotherParticipantTyping = this.typingParticipants.length > 0;
        console.log('[AudioRecorder] Updated typing participants:', this.typingParticipants);
    }

    handleParticipantChange(messageData) {
        console.log('[AudioRecorder] Handling participant change:', JSON.stringify(messageData, null, 2));
        const { actor, operation } = messageData;

        if (!actor || !actor.actorName) {
            console.warn('[AudioRecorder] Missing actor information in participant event');
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

    // Update the audio playback method to handle the sequential flow
    async playAudioResponse(audioUrl) {
        try {
            console.log('Starting audio playback with URL:', audioUrl);
            this.isPlayingAudio = true;
            this.audioElement.src = audioUrl;

            // Remove any existing event listeners
            this.audioElement.removeEventListener('ended', this.handleAudioEnded);

            // Return a promise that resolves when audio playback is complete
            await new Promise((resolve, reject) => {
                this.audioElement.addEventListener('canplay', () => console.log('Audio can play'));
                this.audioElement.addEventListener('error', (e) => {
                    console.error('Audio error:', e);
                    reject(e);
                });

                this.audioElement.addEventListener('ended', () => {
                    console.log('Audio playback completed');
                    this.isPlayingAudio = false;
                    resolve();
                });

                this.audioElement.play().catch(reject);
            });

            // After audio completes, handle continuation
            this.handleConversationContinuation();
        } catch (error) {
            console.error('Audio playback error:', error);
            this.handleError(new Error(`Audio playback error: ${error.message}`));
            this.isPlayingAudio = false;
            // Even if audio fails, try to continue the conversation
            this.handleConversationContinuation();
        }
    }

    get audioIndicatorClass() {
        return this.isPlayingAudio ? 'audio-indicator playing' : 'audio-indicator';
    }

    handleMessageClass(message) {
        this.currentMessage = message;
        return this.getMessageClass;
    }

    get getMessageBubbleClass() {
        const message = this.currentMessage;
        if (!message) return 'message-bubble';

        const classes = ['message-bubble'];

        // Add appropriate bubble class based on message type
        switch (message.type) {
            case 'user':
                classes.push('outgoing');
                break;
            case 'agent':
                classes.push('incoming');
                break;
            case 'system':
                classes.push('system');
                break;
            case 'preview':
                classes.push('preview');
                break;
        }

        return classes.join(' ');
    }

    get getMessageClass() {
        const message = this.currentMessage;
        if (!message) return 'message';

        const classes = ['message'];

        // Add message type class
        switch (message.type) {
            case 'user':
                classes.push('outgoing');
                break;
            case 'agent':
                classes.push('incoming');
                break;
            case 'system':
                classes.push('system');
                break;
            case 'preview':
                classes.push('preview outgoing');
                break;
        }

        // Add animation classes
        if (message.fadeIn) classes.push('fade-in');
        if (message.fadeOut) classes.push('fade-out');

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

    // Update the conversation getter to maintain correct order
    get conversation() {
        // Filter out preview messages and maintain correct order
        return this.conversationMessages.filter((message) => message.type !== 'preview').reverse(); // Reverse the array to show newest messages at the top
    }

    handleRoutingEvent(routingData) {
        console.log('[AudioRecorder] Handling routing event:', routingData);

        // Add appropriate system message based on routing result
        let message = '';
        if (routingData.routingType === 'Initial') {
            if (routingData.failureType === 'None') {
                message = 'Connecting to service...';
            } else {
                message = `Connection failed: ${routingData.failureReason || 'Unknown error'}`;
            }
        } else if (routingData.routingType === 'Transfer') {
            message = 'Transferring conversation...';
        }

        if (message) {
            this.conversationStateService.addMessage(message, 'system', 'System', true);
        }
    }

    // Update current transcription
    updateCurrentTranscription(text) {
        if (!this.currentTranscription) {
            // Add preview message for real-time transcription
            this.currentTranscription = {
                id: window.crypto.randomUUID(),
                text: text.trim(),
                type: 'preview',
                timestamp: new Date().toISOString(),
                isLoading: false,
                userName: 'You',
                fadeIn: true,
                fadeOut: false
            };
            // Add to conversation state
            this.conversationMessages = [...this.conversationMessages, this.currentTranscription];
        } else {
            // Update existing preview message text
            this.currentTranscription.text = text.trim();
            // Force a reactive update
            this.conversationMessages = [...this.conversationMessages];
        }
    }
}
