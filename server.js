const fs = require('fs');
const path = require('path');
const express = require('express');
const httpApp = express();
const server = require('http').createServer(httpApp);
const io = require('socket.io').listen(server);
const port = Number(process.env.PORT) || 8080;

const SLOT_COUNT = 10;

const questionsFile =
    process.env.QUESTIONS_JSON || 'dawah_family_feud_questions.json';
const questionsPath = path.join(__dirname, 'public/data', questionsFile);

function shuffleArray(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var t = a[i];
        a[i] = a[j];
        a[j] = t;
    }
    return a;
}

function loadQuestionKeysOrderedRandom() {
    try {
        var raw = fs.readFileSync(questionsPath, 'utf8');
        var data = JSON.parse(raw);
        return shuffleArray(Object.keys(data));
    } catch (err) {
        console.error('Could not load questions for shuffle:', questionsPath, err);
        return [];
    }
}

function defaultSnapshot(questionOrder) {
    return {
        questionIndex: 0,
        flipped: Array(SLOT_COUNT).fill(false),
        team1: 0,
        team2: 0,
        boardRound: 0,
        wrong: 0,
        questionOrder: questionOrder.slice(),
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
        questionOrder: Array.isArray(s.questionOrder)
            ? s.questionOrder.slice()
            : [],
    };
}

var initialQuestionOrder = loadQuestionKeysOrderedRandom();
let gameSnapshot = defaultSnapshot(initialQuestionOrder);
let hostSocketId = null;

server.listen(port);
console.log('Listening on ' + port);
console.log(
    'Question deck order randomized (' +
        gameSnapshot.questionOrder.length +
        ' questions):',
    questionsFile
);

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
            var merged = cloneSnapshot(data.snapshot);
            if (
                !merged.questionOrder.length &&
                gameSnapshot.questionOrder.length
            ) {
                merged.questionOrder = gameSnapshot.questionOrder.slice();
            }
            gameSnapshot = merged;
        }

        io.sockets.emit('listening', data);
    });

    socket.on('disconnect', () => {
        if (socket.id === hostSocketId) {
            hostSocketId = null;
        }
    });
});
