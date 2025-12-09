// Simple WebRTC Video Chat Application
// Uses a public signaling server for demo purposes

const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

let localStream = null;
let peerConnection = null;
let signalingSocket = null;
let roomId = null;

const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');
const joinButton = document.getElementById('join');
const leaveButton = document.getElementById('leave');
const roomInput = document.getElementById('room-id');
const statusDiv = document.getElementById('status');

// Update status message
function updateStatus(message) {
    statusDiv.textContent = message;
    console.log(message);
}

// Initialize local media stream
async function initLocalStream() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: { 
                width: { ideal: 720 },
                height: { ideal: 1280 },
                facingMode: 'user'
            },
            audio: true
        });
        
        localVideo.srcObject = localStream;
        updateStatus('Camera and microphone ready');
        return true;
    } catch (error) {
        console.error('Error accessing media devices:', error);
        updateStatus('Error: Could not access camera/microphone');
        return false;
    }
}

// Create peer connection
function createPeerConnection() {
    peerConnection = new RTCPeerConnection(configuration);

    // Add local stream tracks to peer connection
    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });

    // Handle incoming remote stream
    peerConnection.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
            remoteVideo.srcObject = event.streams[0];
            updateStatus('Connected to peer');
        }
    };

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            sendSignal({
                type: 'ice-candidate',
                candidate: event.candidate,
                room: roomId
            });
        }
    };

    // Handle connection state changes
    peerConnection.onconnectionstatechange = () => {
        updateStatus(`Connection: ${peerConnection.connectionState}`);
        if (peerConnection.connectionState === 'disconnected' || 
            peerConnection.connectionState === 'failed') {
            updateStatus('Peer disconnected');
        }
    };
}

// Connect to signaling server (using a simple WebSocket approach)
function connectSignaling() {
    // Using local signaling server
    const WS_URL = 'https://pipeline-main.onrender.com:3001';
    
    signalingSocket = new WebSocket(WS_URL);

    signalingSocket.onopen = () => {
        updateStatus('Connected to signaling server');
        sendSignal({ type: 'join', room: roomId });
    };

    signalingSocket.onmessage = async (event) => {
        const data = JSON.parse(event.data);
        await handleSignalingMessage(data);
    };

    signalingSocket.onerror = (error) => {
        console.error('Signaling error:', error);
        updateStatus('Signaling server error - using fallback');
        // Fallback: show manual signaling instructions
        showManualSignaling();
    };

    signalingSocket.onclose = () => {
        updateStatus('Disconnected from signaling server');
    };
}

// Send signaling message
function sendSignal(message) {
    if (signalingSocket && signalingSocket.readyState === WebSocket.OPEN) {
        signalingSocket.send(JSON.stringify(message));
    }
}

// Handle incoming signaling messages
async function handleSignalingMessage(data) {
    switch (data.type) {
        case 'ready':
            // Another peer is ready, create offer
            updateStatus('Peer found, creating offer...');
            await createOffer();
            break;

        case 'offer':
            updateStatus('Received offer, creating answer...');
            await handleOffer(data.offer);
            break;

        case 'answer':
            updateStatus('Received answer, connecting...');
            await handleAnswer(data.answer);
            break;

        case 'ice-candidate':
            await handleIceCandidate(data.candidate);
            break;

        case 'peer-left':
            updateStatus('Peer left the room');
            if (remoteVideo.srcObject) {
                remoteVideo.srcObject.getTracks().forEach(track => track.stop());
                remoteVideo.srcObject = null;
            }
            break;
    }
}

// Create and send offer
async function createOffer() {
    try {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        sendSignal({
            type: 'offer',
            offer: offer,
            room: roomId
        });
    } catch (error) {
        console.error('Error creating offer:', error);
        updateStatus('Error creating offer');
    }
}

// Handle received offer
async function handleOffer(offer) {
    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        sendSignal({
            type: 'answer',
            answer: answer,
            room: roomId
        });
    } catch (error) {
        console.error('Error handling offer:', error);
        updateStatus('Error handling offer');
    }
}

// Handle received answer
async function handleAnswer(answer) {
    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (error) {
        console.error('Error handling answer:', error);
        updateStatus('Error handling answer');
    }
}

// Handle ICE candidate
async function handleIceCandidate(candidate) {
    try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
        console.error('Error adding ICE candidate:', error);
    }
}

// Show manual signaling fallback
function showManualSignaling() {
    updateStatus('Using manual signaling mode');
    alert('Signaling server unavailable. For a working demo:\n\n' +
          '1. Both users should join the same room\n' +
          '2. Copy/paste SDP offers and answers manually\n' +
          '3. Or deploy your own signaling server\n\n' +
          'Check console for connection details.');
}

// Join call
async function joinCall() {
    roomId = roomInput.value.trim();
    
    if (!roomId) {
        alert('Please enter a room ID');
        return;
    }

    joinButton.disabled = true;
    updateStatus('Initializing...');

    // Get local media
    const mediaReady = await initLocalStream();
    if (!mediaReady) {
        joinButton.disabled = false;
        return;
    }

    // Create peer connection
    createPeerConnection();

    // Connect to signaling server
    connectSignaling();

    leaveButton.disabled = false;
    roomInput.disabled = true;
    updateStatus(`Joined room: ${roomId}`);
}

// Leave call
function leaveCall() {
    // Close peer connection
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }

    // Close signaling connection
    if (signalingSocket) {
        sendSignal({ type: 'leave', room: roomId });
        signalingSocket.close();
        signalingSocket = null;
    }

    // Stop local stream
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
        localVideo.srcObject = null;
    }

    // Clear remote video
    if (remoteVideo.srcObject) {
        remoteVideo.srcObject.getTracks().forEach(track => track.stop());
        remoteVideo.srcObject = null;
    }

    // Reset UI
    joinButton.disabled = false;
    leaveButton.disabled = true;
    roomInput.disabled = false;
    roomId = null;
    updateStatus('Left the call');
}

// Event listeners
joinButton.onclick = joinCall;
leaveButton.onclick = leaveCall;

// Cleanup on page unload
window.addEventListener('beforeunload', leaveCall);
