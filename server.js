const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Serve static files from Vite build
app.use(express.static(path.join(__dirname, 'dist')));

// Game State
const players = {};
// ballState: { ownerId: string | null, position: {x,y,z}, velocity: {x,y,z} }
let ballState = {
    ownerId: null,
    position: { x: 0, y: 5, z: 0 },
    velocity: { x: 0, y: 0, z: 0 }
};

io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);

    // Add new player
    players[socket.id] = {
        id: socket.id,
        position: { x: 0, y: 2, z: 0 },
        quaternion: { x: 0, y: 0, z: 0, w: 1 },
        animState: 'idle'
    };

    // Send current state to new player
    socket.emit('init', { players, ballState });

    // Broadcast new player to others
    socket.broadcast.emit('player_joined', players[socket.id]);

    // Handle Player Movement
    socket.on('player_update', (data) => {
        if (players[socket.id]) {
            players[socket.id] = { ...players[socket.id], ...data };
            // Volatile for smooth movement (drops packets if congested)
            socket.broadcast.volatile.emit('player_moved', {
                id: socket.id,
                ...data
            });
        }
    });

    // Handle Ball Updates (Ownership change, Shot)
    socket.on('ball_update', (data) => {
        // Simple trust-client logic for prototype
        ballState = { ...ballState, ...data };
        socket.broadcast.emit('ball_updated', ballState);
    });

    socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id);
        delete players[socket.id];
        io.emit('player_left', socket.id);

        // If they had the ball, reset it
        if (ballState.ownerId === socket.id) {
            ballState.ownerId = null;
            ballState.velocity = { x: 0, y: 0, z: 0 };
            ballState.position = { x: 0, y: 5, z: 0 }; // Center
            io.emit('ball_updated', ballState);
        }
    });
});

// Serve index.html for all other routes (SPA support)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
