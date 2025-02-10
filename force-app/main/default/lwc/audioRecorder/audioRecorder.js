import { LightningElement, track, wire, api } from 'lwc';
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
import setConfigurationName from '@salesforce/apex/AgentMessagingService.setConfigurationName';

export default class AudioRecorder extends LightningElement {
    @api configurationDeveloperName;
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

    // Add new properties for state management
    @track uiState = {
        isInitializing: false,
        isTransitioning: false
    };

    // Debounce timer for UI updates
    _uiUpdateTimer = null;

    // Add state batching timeout
    _stateUpdateTimeout = null;

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

        // Optimize conversation state updates
        this.conversationStateService.addStateChangeHandler((conversation) => {
            if (this._uiUpdateTimer) {
                clearTimeout(this._uiUpdateTimer);
            }

            this._uiUpdateTimer = setTimeout(() => {
                console.log('[AudioRecorder] Conversation state changed:', conversation);
                this.conversationMessages = [...conversation];
                console.log('[AudioRecorder] Updated conversation state:', this.conversationMessages);

                // Schedule scroll after state update
                requestAnimationFrame(() => {
                    this.scrollToLatestMessage();
                });
            }, 16); // Roughly one frame at 60fps
        });

        // Optimize message handling
        this.messagingService.addMessageHandler((messageData) => {
            requestAnimationFrame(() => {
                this.handleServerMessage(messageData);
            });
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

    // Optimize device initialization
    async initializeRecording() {
        if (this.uiState.isInitializing) return;

        try {
            this.uiState.isInitializing = true;

            if (!this.selectedDeviceId) {
                throw new Error('Please select a microphone device first');
            }

            // Initialize services in parallel where possible
            await Promise.all([
                this.audioDeviceService.initialize(this.selectedDeviceId),
                this.whisperService.initialize(),
                this.messagingService.initialize(this.configurationDeveloperName)
            ]);

            this.micInitialized = true;
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
            this.cleanup();
        } finally {
            this.uiState.isInitializing = false;
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

    // Batch state updates method
    batchStateUpdates(updates) {
        if (this._stateUpdateTimeout) {
            clearTimeout(this._stateUpdateTimeout);
        }

        this._stateUpdateTimeout = setTimeout(() => {
            requestAnimationFrame(() => {
                Object.entries(updates).forEach(([key, value]) => {
                    this[key] = value;
                });
            });
        }, 16); // One frame at 60fps
    }

    // Optimize recording start
    async startRecording() {
        if (this.uiState.isTransitioning) return;

        try {
            this.uiState.isTransitioning = true;

            // Batch initial state updates
            this.batchStateUpdates({
                isManualStop: false,
                autoStopEnabled: true,
                isRecording: true,
                isProcessingAgentResponse: false
            });

            if (!this.micInitialized) {
                throw new Error('Please initialize the microphone first');
            }

            await this.prepareRecordingState();
            await this.initializeRecordingServices();

            console.log('Starting whisper service with real-time transcription...');
            await this.startWhisperService();

            console.log('Recording started successfully');
        } catch (error) {
            this.handleError(error);
            this.batchStateUpdates({
                isRecording: false
            });
        } finally {
            this.uiState.isTransitioning = false;
        }
    }

    // Helper method to prepare recording state
    async prepareRecordingState() {
        window.audioStream = this.audioDeviceService.stream;
        this.isRecording = true;
        this.isProcessingAgentResponse = false;
    }

    // Helper method to initialize recording services
    async initializeRecordingServices() {
        await this.silenceDetectionService.initialize(this.audioDeviceService.stream, {
            onSilenceDetected: () => requestAnimationFrame(() => this.handleSilenceDetected()),
            onSilenceProgress: (duration) => requestAnimationFrame(() => this.handleSilenceProgress(duration))
        });
        this.silenceDetectionService.start();
    }

    // Helper method to start whisper service
    async startWhisperService() {
        await this.whisperService.start((error) => {
            console.error('Transcription error:', error);
            this.handleError(error);
        });
    }

    // Optimize scroll behavior
    scrollToLatestMessage() {
        const container = this.template.querySelector('.conversation-container');
        if (container) {
            const scrollOptions = {
                top: 0,
                behavior: 'smooth'
            };

            // If there's a typing indicator, prioritize scrolling to it
            const typingIndicator = this.template.querySelector('.typing-indicator');
            if (typingIndicator && this.isAnotherParticipantTyping) {
                typingIndicator.classList.add('visible');
                container.scrollTo(scrollOptions);
                return;
            }

            // Otherwise, scroll to the top where the newest message is
            container.scrollTo(scrollOptions);
        }
    }

    // Optimize stop recording
    async stopRecording() {
        if (this.isManualStop) {
            this.batchStateUpdates({
                isManualStop: false
            });
            return;
        }

        try {
            this.batchStateUpdates({
                isRecording: false,
                isProcessingAgentResponse: true
            });

            this.silenceDetectionService.stop();
            this.whisperService.stop();

            const finalTranscription = await this.whisperService.getFinalTranscription();

            if (finalTranscription?.trim()) {
                try {
                    console.log('Sending message to agent:', finalTranscription);
                    await this.messagingService.sendMessage(finalTranscription);
                    console.log('Message sent successfully, waiting for response through events');
                } catch (error) {
                    console.error('Error in message processing:', error);
                    this.handleError(error);
                    this.conversationStateService.addMessage(
                        'Failed to process message. Please try again.',
                        'system',
                        'System',
                        true
                    );
                    this.handleConversationContinuation();
                }
            } else {
                this.handleConversationContinuation();
            }
        } catch (error) {
            this.handleError(error);
            this.handleConversationContinuation();
        } finally {
            this.batchStateUpdates({
                isProcessingAgentResponse: false
            });
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
            const isAgentMessage =
                messageData.data?.conversationEntry?.sender?.role === 'Agent' ||
                messageData.data?.conversationEntry?.sender?.role === 'Bot';

            // Set processing state before handling message
            this.isProcessingAgentResponse = true;

            // Always clean up preview messages when receiving any message
            const incomingText = this.extractMessageText(messageData);
            this.conversationMessages = this.conversationMessages.filter((msg) => {
                if (msg.type === 'preview') {
                    // Keep preview only if it's different from incoming message
                    return incomingText && msg.text !== incomingText;
                }
                return true;
            });

            // Clear current transcription if it matches incoming message
            if (this.currentTranscription && this.currentTranscription.text === incomingText) {
                this.currentTranscription = null;
            }

            // If it's an agent message, clear typing indicator for that agent
            if (isAgentMessage && messageData.data?.conversationEntry?.senderDisplayName) {
                const agentName = messageData.data.conversationEntry.senderDisplayName;
                this.typingParticipants = this.typingParticipants.filter((p) => p.name !== agentName);
                this.isAnotherParticipantTyping = this.typingParticipants.length > 0;
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
                    this.handleConversationContinuation();
                }
            }

            // Scroll to the latest message
            this.scrollToLatestMessage();
        } catch (error) {
            console.error('[AudioRecorder] Error handling incoming message:', error);
            this.handleError(error);
            this.handleConversationContinuation();
        } finally {
            // Reset processing state after handling message
            this.isProcessingAgentResponse = false;
        }
    }

    // Helper method to extract message text
    extractMessageText(messageData) {
        try {
            const entryPayload = JSON.parse(messageData.data?.conversationEntry?.entryPayload || '{}');
            return entryPayload?.abstractMessage?.staticContent?.text || '';
        } catch (error) {
            console.warn('[AudioRecorder] Error extracting message text:', error);
            return '';
        }
    }

    handleTypingIndicator(messageData) {
        console.log('[AudioRecorder] Handling typing indicator:', messageData);
        const { actor, type } = messageData;
        if (!actor || !actor.actorName) {
            console.warn('[AudioRecorder] Missing actor information in typing indicator event');
            return;
        }

        // Clear any existing debounce timeout for this actor
        if (this._typingDebounceTimers?.get(actor.actorName)) {
            clearTimeout(this._typingDebounceTimers.get(actor.actorName));
        }

        // Initialize the map if it doesn't exist
        if (!this._typingDebounceTimers) {
            this._typingDebounceTimers = new Map();
        }

        requestAnimationFrame(() => {
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

                // Set a timeout to automatically clear the typing indicator if no update is received
                this._typingDebounceTimers.set(
                    actor.actorName,
                    setTimeout(() => {
                        this.typingParticipants = this.typingParticipants.filter((p) => p.name !== actor.actorName);
                        this.isAnotherParticipantTyping = this.typingParticipants.length > 0;
                        this._typingDebounceTimers.delete(actor.actorName);
                    }, 3000) // Clear after 3 seconds of no updates
                );
            } else {
                // Remove from typing participants
                this.typingParticipants = this.typingParticipants.filter((p) => p.name !== actor.actorName);
                this._typingDebounceTimers.delete(actor.actorName);
            }

            // Update the typing indicator visibility
            this.isAnotherParticipantTyping = this.typingParticipants.length > 0;

            // If typing started, scroll to the typing indicator
            if (this.isAnotherParticipantTyping) {
                this.scrollToTypingIndicator();
            }
        });
    }

    // Add new method to scroll to typing indicator
    scrollToTypingIndicator() {
        requestAnimationFrame(() => {
            const container = this.template.querySelector('.conversation-container');
            const typingIndicator = this.template.querySelector('.typing-indicator');

            if (container && typingIndicator) {
                // Add visible class for animation
                typingIndicator.classList.add('visible');

                // Scroll to top where typing indicator is
                container.scrollTo({
                    top: 0,
                    behavior: 'smooth'
                });
            }
        });
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

        // Clear all typing indicator timers
        if (this._typingDebounceTimers) {
            this._typingDebounceTimers.forEach((timer) => clearTimeout(timer));
            this._typingDebounceTimers.clear();
        }

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
                classes.push('preview');
                break;
        }

        // Add animation classes
        if (message.fadeIn) classes.push('fade-in');
        if (message.fadeOut) classes.push('fade-out');

        return classes.join(' ');
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

    // Optimize handle stop click
    handleStopClick() {
        this.batchStateUpdates({
            isManualStop: true,
            autoStopEnabled: false,
            isRecording: false,
            isProcessingAgentResponse: false
        });

        this.silenceDetectionService.stop();
        this.whisperService.stop();

        if (this.isPlayingAudio && this.audioElement) {
            this.audioElement.pause();
            this.audioElement.src = '';
            this.batchStateUpdates({
                isPlayingAudio: false
            });
        }

        this.conversationStateService.addMessage('Conversation stopped by user', 'system', 'System', true);
    }

    // Update the conversation getter to maintain correct order
    get conversation() {
        return this.conversationMessages.slice().reverse();
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
        const trimmedText = text.trim();

        // Don't update if we're processing a response or if there's a final version
        if (
            this.isProcessingAgentResponse ||
            this.conversationMessages.some((m) => m.type === 'user' && m.text === trimmedText)
        ) {
            return;
        }

        // Remove any existing preview messages first
        this.conversationMessages = this.conversationMessages.filter((msg) => msg.type !== 'preview');

        // Create new preview message
        const previewMessage = {
            id: window.crypto.randomUUID(),
            text: trimmedText,
            type: 'preview',
            timestamp: new Date().toISOString(),
            userName: 'You'
        };

        this.currentTranscription = previewMessage;

        // Only add the preview if it's not empty
        if (trimmedText) {
            this.conversationMessages = [...this.conversationMessages, previewMessage];
        }
    }
}
