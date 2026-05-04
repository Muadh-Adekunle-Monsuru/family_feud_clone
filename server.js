const path = require('path');
const express = require('express');
const httpApp = express();
const server = require('http').createServer(httpApp);
const io = require('socket.io').listen(server);
const port = Number(process.env.PORT) || 8080;

const SLOT_COUNT = 10;

function defaultSnapshot() {
    return {
        questionIndex: 0,
        flipped: Array(SLOT_COUNT).fill(false),
        team1: 0,
        team2: 0,
        boardRound: 0,
        wrong: 0,
    };
}

function cloneSnapshot(s) {
    return {
        questionIndex: s.questionIndex,
        flipped: s.flipped.slice(),
        team1: s.team1,
        team2: s.team2,
        boardRound: s.boardRound,
        wrong: s.wrong,
    };
}

let gameSnapshot = defaultSnapshot();
let hostSocketId = null;

server.listen(port);
console.log('Listening on ' + port);

const publicDir = path.join(__dirname, 'public');
httpApp.use('/public', express.static(publicDir));
httpApp.get('/', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));

io.sockets.on('connection', (socket) => {
    socket.emit('listening', {
        trigger: 'sync',
        snapshot: cloneSnapshot(gameSnapshot),
    });

    socket.on('talking', (data) => {
        if (!data || typeof data !== 'object') return;

        if (data.trigger === 'hostAssigned') {
            hostSocketId = socket.id;
        }

        if (hostSocketId && socket.id !== hostSocketId) {
            return;
        }

        if (data.snapshot) {
            gameSnapshot = cloneSnapshot(data.snapshot);
        }

        io.sockets.emit('listening', data);
    });

    socket.on('disconnect', () => {
        if (socket.id === hostSocketId) {
            hostSocketId = null;
        }
    });
});
