// WebRTC Signaling Server - Production Ready for Render.com
// Run with: node signaling-server.js

import { createServer } from 'http';
import { WebSocketServer } from 'ws';

const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';
const rooms = new Map();

console.log(`Starting WebRTC Signaling Server...`);
console.log(`Environment: ${NODE_ENV}`);
console.log(`Port: ${PORT}`);

// Connection statistics
let totalConnections = 0;
let activeConnections = 0;

// Health check endpoint for Render
const server = createServer((req, res) => {
    // CORS headers for production
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    if (req.url === '/' || req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'ok',
            service: 'webrtc-signaling',
            uptime: process.uptime(),
            rooms: rooms.size,
            activeConnections: activeConnections,
            totalConnections: totalConnections,
            timestamp: new Date().toISOString()
        }));
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
    }
});

const wss = new WebSocketServer({ 
    server,
    // Render-specific configurations
    perMessageDeflate: false,
    clientTracking: true
});

// Cleanup inactive rooms periodically
const cleanupInterval = setInterval(() => {
    let cleaned = 0;
    
    for (const [roomId, room] of rooms.entries()) {
        // Remove rooms with no active connections
        const activeClients = room.filter(ws => ws.readyState === 1);
        if (activeClients.length === 0) {
            rooms.delete(roomId);
            cleaned++;
        } else if (activeClients.length !== room.length) {
            rooms.set(roomId, activeClients);
        }
    }
    
    if (cleaned > 0) {
        console.log(`[Cleanup] Removed ${cleaned} empty room(s). Active rooms: ${rooms.size}`);
    }
}, 60000); // Every minute

wss.on('connection', (ws, req) => {
    totalConnections++;
    activeConnections++;
    
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    console.log(`[Connect] Client connected from ${clientIp} (Total: ${totalConnections}, Active: ${activeConnections})`);
    
    let currentRoom = null;
    let heartbeatInterval = null;

    // Heartbeat to keep connection alive (important for Render)
    ws.isAlive = true;
    ws.on('pong', () => {
        ws.isAlive = true;
    });

    heartbeatInterval = setInterval(() => {
        if (ws.isAlive === false) {
            console.log(`[Heartbeat] Client timeout, terminating connection`);
            return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
    }, 30000); // 30 seconds

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            switch (data.type) {
                case 'join':
                    currentRoom = data.room;
                    
                    if (!currentRoom || typeof currentRoom !== 'string') {
                        console.warn(`[Warning] Invalid room ID received`);
                        return;
                    }
                    
                    if (!rooms.has(currentRoom)) {
                        rooms.set(currentRoom, []);
                    }
                    
                    const room = rooms.get(currentRoom);
                    room.push(ws);
                    
                    console.log(`[Room] Client joined "${currentRoom}" (${room.length} peer${room.length > 1 ? 's' : ''})`);
                    
                    // Notify other peers in the room
                    room.forEach(client => {
                        if (client !== ws && client.readyState === 1) {
                            client.send(JSON.stringify({ type: 'ready' }));
                        }
                    });
                    break;

                case 'offer':
                case 'answer':
                case 'ice-candidate':
                    // Forward to other peers in the room
                    if (currentRoom && rooms.has(currentRoom)) {
                        rooms.get(currentRoom).forEach(client => {
                            if (client !== ws && client.readyState === 1) {
                                client.send(JSON.stringify(data));
                            }
                        });
                    }
                    break;

                case 'leave':
                    handleLeave(ws, currentRoom);
                    break;
            }
        } catch (error) {
            console.error('[Error] Error handling message:', error);
        }
    });

    ws.on('close', () => {
        activeConnections--;
        console.log(`[Disconnect] Client disconnected (Active: ${activeConnections})`);
        
        if (heartbeatInterval) {
            clearInterval(heartbeatInterval);
        }
        
        handleLeave(ws, currentRoom);
    });

    ws.on('error', (error) => {
        console.error(`[Error] WebSocket error:`, error.message);
    });
});

function handleLeave(ws, roomId) {
    if (roomId && rooms.has(roomId)) {
        const room = rooms.get(roomId);
        const index = room.indexOf(ws);
        
        if (index !== -1) {
            room.splice(index, 1);
            console.log(`[Room] Client left "${roomId}" (${room.length} peer${room.length !== 1 ? 's' : ''} remaining)`);
            
            // Notify other peers
            room.forEach(client => {
                if (client.readyState === 1) {
                    client.send(JSON.stringify({ type: 'peer-left' }));
                }
            });
            
            // Clean up empty rooms
            if (room.length === 0) {
                rooms.delete(roomId);
            }
        }
    }
}

server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n✅ WebRTC Signaling Server is running!`);
    console.log(`📡 Port: ${PORT}`);
    console.log(`🌍 Environment: ${NODE_ENV}`);
    console.log(`🔗 Health check: http://localhost:${PORT}/health`);
    
    if (NODE_ENV === 'production') {
        console.log(`\n⚠️  Remember to update your frontend with this WebSocket URL:`);
        console.log(`   wss://YOUR-APP-NAME.onrender.com\n`);
    } else {
        console.log(`🔗 WebSocket URL: ws://localhost:${PORT}\n`);
    }
});

// Graceful shutdown
function shutdown() {
    console.log('\n🛑 Shutting down gracefully...');
    
    // Clear cleanup interval
    if (cleanupInterval) {
        clearInterval(cleanupInterval);
    }
    
    // Close all WebSocket connections
    wss.clients.forEach((client) => {
        client.close(1000, 'Server shutting down');
    });
    
    // Close server
    server.close(() => {
        console.log('✅ Server closed successfully');
        process.exit(0);
    });
    
    // Force close after 10 seconds
    setTimeout(() => {
        console.error('⚠️  Forced shutdown after timeout');
        process.exit(1);
    }, 10000);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Handle uncaught errors
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    shutdown();
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});
