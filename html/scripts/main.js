// Register the Service Worker (ensure this is only done once)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/scripts/service-worker.js')
            .then(registration => {
                console.log('ServiceWorker registered with scope: ', registration.scope);
            })
            .catch(error => {
                console.log('ServiceWorker registration failed: ', error);
            });
    });
}

// Existing variables
let orientationPermissionGranted = false;
let debug = false; // Set debug mode to false by default
let isPlaying = false; // Track if the audio is playing

// Existing element references
const startButton = document.getElementById('startButton');
const loadingIndicator = document.getElementById('loading-indicator');
const outputOrientation = document.getElementById('output-orientation');
const rotationBar = document.getElementById('rotation-bar');
const image1 = document.getElementById('image1');
const image2 = document.getElementById('image2');
const offlineIndicator = document.getElementById('offline-indicator');
const progressContainer = document.getElementById('progress-container');
const progressBar = document.getElementById('progress-bar');
const timeDisplay = document.getElementById('time-display');

// New element references
const sliderContainer = document.getElementById('slider-container');
const mixerSlider = document.getElementById('mixerSlider');

// Variables for Web Audio API
let audioBuffer = null;
let audioSource = null;
let audioDuration = 0;
let audioStartTime = 0;
let progressInterval = null;

// Function to detect mobile devices
function isMobileDevice() {
    return /Mobi|Android/i.test(navigator.userAgent);
}

// Initialize the app based on device type
function initializeApp() {
    if (isMobileDevice()) {
        // Hide the slider
        sliderContainer.style.display = 'none';
        // Show the orientation-related elements if in debug mode
        if (debug) {
            outputOrientation.style.display = 'block';
            rotationBar.style.display = 'block';
        }
    } else {
        // Hide the orientation-related elements
        outputOrientation.style.display = 'none';
        rotationBar.style.display = 'none';
        // Show the slider
        sliderContainer.style.display = 'block';
        // Initialize the slider event listener
        initializeSlider();
    }
}

// Initialize the slider
function initializeSlider() {
    mixerSlider.addEventListener('input', handleSliderInput);
}

function handleSliderInput(event) {
    const value = event.target.value;
    // value is between 0 and 100
    const normalized = value / 100; // normalized between 0 and 1

    updateMix(normalized);
}

function updateMix(normalized) {
    // Adjust gains for crossfading
    gainNode1_L.gain.value = gainNode1_R.gain.value = 1 - normalized;
    gainNode2_L.gain.value = gainNode2_R.gain.value = normalized;

    // Update the image opacity based on the audio crossfade
    image1.style.opacity = 1 - normalized; // Image 1 visibility
    image2.style.opacity = normalized;     // Image 2 visibility
}

// Show offline indicator if offline
window.addEventListener('load', () => {
    if (!navigator.onLine) {
        offlineIndicator.style.display = 'block';
    }
});

window.addEventListener('online', () => {
    offlineIndicator.style.display = 'none';
});

window.addEventListener('offline', () => {
    offlineIndicator.style.display = 'block';
});

// Set up the Web Audio API context
const audioContext = new (window.AudioContext || window.webkitAudioContext)();

// Integrate Unmute functionality
let allowBackgroundPlayback = false; // default false, recommended false
let forceIOSBehavior = false; // default false, recommended false
let unmuteHandle = null;

if (audioContext) {
    // Initialize Unmute to handle audio autoplay restrictions
    unmuteHandle = unmute(audioContext, allowBackgroundPlayback, forceIOSBehavior);
}

// Create a ChannelSplitterNode to split the 4-channel audio into individual channels
const splitter = audioContext.createChannelSplitter(4);

// Create GainNodes for each individual channel
const gainNode1_L = audioContext.createGain(); // Channel 1 (left of stereo pair 1)
const gainNode1_R = audioContext.createGain(); // Channel 2 (right of stereo pair 1)
const gainNode2_L = audioContext.createGain(); // Channel 3 (left of stereo pair 2)
const gainNode2_R = audioContext.createGain(); // Channel 4 (right of stereo pair 2)

// Create a ChannelMergerNode to merge the left and right channels back into stereo
const merger = audioContext.createChannelMerger(2);

// Connect the GainNodes to the merger
gainNode1_L.connect(merger, 0, 0); // Left channels to input 0 (left)
gainNode2_L.connect(merger, 0, 0);
gainNode1_R.connect(merger, 0, 1); // Right channels to input 1 (right)
gainNode2_R.connect(merger, 0, 1);

// Connect the merger to the audio context destination (speakers)
merger.connect(audioContext.destination);

// Set initial gains for crossfading
gainNode1_L.gain.value = gainNode1_R.gain.value = 0.5;
gainNode2_L.gain.value = gainNode2_R.gain.value = 0.5;

// Event listener for the start button to play and stop audio
if (startButton) {
    startButton.addEventListener('click', () => {
        const title = document.querySelector('h1');
        if (!isPlaying) {
            if (isMobileDevice()) {
                // Request orientation permission for mobile devices (iOS especially)
                requestOrientationPermission();
            }
            loadAudio();
            startButton.textContent = 'Stop';
            title.style.opacity = '0'; // Fade out instruction text
        } else {
            stopAudio();
            startButton.textContent = 'Start';
            title.style.opacity = '1'; // Fade in instruction text
        }
        isPlaying = !isPlaying;
    });
} else {
    console.warn('Start button not found. Please ensure there is a button with id "startButton" in your HTML.');
}

function loadAudio() {
    if (audioBuffer) {
        // Audio is already loaded, play it
        playAudio();
        return;
    }

    // Show loading indicator
    loadingIndicator.style.display = 'block';
    startButton.disabled = true;

    // Fetch and decode the audio data
    fetch('audio/version5.m4a')
        .then(response => response.arrayBuffer())
        .then(arrayBuffer => audioContext.decodeAudioData(arrayBuffer))
        .then(decodedData => {
            audioBuffer = decodedData;
            loadingIndicator.style.display = 'none'; // Hide loading indicator
            startButton.disabled = false;
            playAudio(); // Play audio once loaded
        })
        .catch(error => {
            console.error('Error loading audio:', error);
        });
}

function playAudio() {
    audioContext.resume().then(() => {
        // Create a new buffer source
        audioSource = audioContext.createBufferSource();
        audioSource.buffer = audioBuffer;

        // Connect the audio source to the splitter and gain nodes
        audioSource.connect(splitter);
        splitter.connect(gainNode1_L, 0);
        splitter.connect(gainNode1_R, 1);
        splitter.connect(gainNode2_L, 2);
        splitter.connect(gainNode2_R, 3);

        // Start the audio
        audioStartTime = audioContext.currentTime;
        audioDuration = audioBuffer.duration;
        audioSource.start(0);

        // Start progress update
        startProgressUpdate();

        // Handle audio end event
        audioSource.onended = () => {
            stopAudio();
            startButton.textContent = 'Start';
            isPlaying = false;
        };
    });
}

function stopAudio() {
    if (audioSource) {
        audioSource.stop();
        audioSource.disconnect();
        audioSource = null;
    }
    audioContext.suspend();
    stopProgressUpdate();
}

function startProgressUpdate() {
    progressInterval = setInterval(updateProgressBar, 100);
}

function stopProgressUpdate() {
    if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
    }
}

function updateProgressBar() {
    const currentTime = audioContext.currentTime - audioStartTime;

    if (audioDuration) {
        const progressPercent = (currentTime / audioDuration) * 100;
        progressBar.style.width = `${progressPercent}%`;

        // Update time display
        const currentTimeFormatted = formatTime(currentTime);
        const durationFormatted = formatTime(audioDuration);
        timeDisplay.textContent = `${currentTimeFormatted} / ${durationFormatted}`;
    }
}

function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const secondsLeft = Math.floor(seconds % 60);
    return `${minutes}:${secondsLeft < 10 ? '0' : ''}${secondsLeft}`;
}

// Allow user to seek by clicking on the progress bar
progressContainer.addEventListener('click', (e) => {
    const width = progressContainer.clientWidth;
    const clickX = e.offsetX;
    const duration = audioDuration;

    const seekTime = (clickX / width) * duration;
    seekAudio(seekTime);
});

function seekAudio(seekTime) {
    if (audioSource) {
        audioSource.stop();
        audioSource.disconnect();
    }

    audioSource = audioContext.createBufferSource();
    audioSource.buffer = audioBuffer;

    // Connect the audioSource to the splitter
    audioSource.connect(splitter);

    // Connect splitter outputs to their respective GainNodes
    splitter.connect(gainNode1_L, 0); // Channel 1 to gainNode1_L
    splitter.connect(gainNode1_R, 1); // Channel 2 to gainNode1_R
    splitter.connect(gainNode2_L, 2); // Channel 3 to gainNode2_L
    splitter.connect(gainNode2_R, 3); // Channel 4 to gainNode2_R

    audioSource.onended = () => {
        stopAudio();
        startButton.textContent = 'Start';
        isPlaying = false;
    };

    audioStartTime = audioContext.currentTime - seekTime;

    // Start playing from seekTime
    audioSource.start(0, seekTime);

    // Restart progress updates
    stopProgressUpdate();
    startProgressUpdate();
}

function requestOrientationPermission() {
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission()
            .then(permissionState => {
                if (permissionState === 'granted') {
                    orientationPermissionGranted = true;
                    initializeOrientationListener();
                } else {
                    alert('Permission denied for accessing orientation data.');
                }
            })
            .catch(console.error);
    } else {
        orientationPermissionGranted = true;
        initializeOrientationListener();
    }
}

function initializeOrientationListener() {
    window.addEventListener("deviceorientation", handleOrientation);
}

function handleOrientation(event) {
    const beta = event.beta; // Front-to-back tilt (beta)

    // Update the text output for orientation only if debug is true
    if (debug) {
        outputOrientation.textContent = `Orientation: ${beta.toFixed(2)}°`;
    }

    // Move the indicator to reflect rotation if debug is true
    if (debug) {
        const indicator = document.getElementById('indicator');
        let position = beta; // beta is between -180 and 180
        position = Math.max(-45, Math.min(45, position)); // Clamp between -45 and 45
        let transformValue = (position / 45) * 100; // Map to percentage
        indicator.style.transform = `translateX(${transformValue}%)`;
    }

    // Adjust so 35 degrees becomes the new "neutral" point (equal volume for both sources)
    const offsetBeta = beta - 35;

    // Map offsetBeta (-45 to 45) to adjust gain between the two sources
    let normalized = (offsetBeta + 45) / 90; // Normalize offsetBeta to a value between 0 and 1
    normalized = Math.max(0, Math.min(1, normalized)); // Clamp normalized between 0 and 1

    updateMix(normalized);
}

// Lock screen orientation to portrait mode
if (screen.orientation && screen.orientation.lock) {
    screen.orientation.lock('portrait').catch(function(error) {
        console.log('Screen orientation lock failed:', error);
    });
}

// Initialize the app when the window loads
window.onload = function() {
    initializeApp();
}