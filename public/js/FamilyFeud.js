var app = {
    version: 2,
    role: 'player',
    socket: io.connect(),
    jsonFile: '/public/data/dawah_family_feud_questions.json',
    currentQ: 0,
    pendingListenPayload: null,
    wrongFlashHideTimer: null,

    SLOT_COUNT: 10,

    team1Score: 0,
    team2Score: 0,
    boardRoundScore: 0,
    wrong: 0,
    flippedState: [],

    board: $(`<div class='gameBoard'>

                <!--- Scores --->
                <div class='score' id='boardScore'>0</div>
                <div class='score teamScore' id='team1'>
                    <div class='teamLabel'>Team A</div>
                    <div class='teamValue'>0</div>
                </div>
                <div class='score teamScore' id='team2'>
                    <div class='teamLabel'>Team B</div>
                    <div class='teamValue'>0</div>
                </div>

                <!--- Main Board --->
                <div id='middleBoard'>

                    <!--- Question --->
                    <div class='questionHolder'>
                        <span class='question'></span>
                    </div>

                    <!--- Answers --->
                    <div class='colHolder'>
                    </div>

                </div>
                <!--- Wrong --->
                <div class='wrongX wrongBoard'>
                    <img alt="not on board" src="/public/img/Wrong.svg"/>
                    <img alt="not on board" src="/public/img/Wrong.svg"/>
                    <img alt="not on board" src="/public/img/Wrong.svg"/>
                </div>
                <div class='wrongFlashOverlay' aria-hidden="true">
                    <img alt="not on board" src="/public/img/Wrong.svg"/>
                </div>

                <!--- Buttons --->
                <div class='btnHolder hide' id="host">
                    <div id='hostBTN'     class='button'>Be the host</div>
                    <div id='awardTeam1'  class='button' data-team='1'>Award Team 1</div>
                    <div id='newQuestion' class='button'>New Question</div>
                    <div id="wrong"       class='button wrongX'>Reset</div>
                    <div id='wrongFlashBtn' class='button wrongX'>
                        <img alt="not on board" src="/public/img/Wrong.svg"/>
                    </div>
                    <div id='awardTeam2'  class='button' data-team='2' >Award Team 2</div>
                </div>

                </div>`),

    shuffle: (array) => {
        var currentIndex = array.length,
            temporaryValue, randomIndex;

        while (0 !== currentIndex) {
            randomIndex = Math.floor(Math.random() * currentIndex);
            currentIndex -= 1;
            temporaryValue = array[currentIndex];
            array[currentIndex] = array[randomIndex];
            array[randomIndex] = temporaryValue;
        }
        return array;
    },

    cloneSnapshot: (snap) => ({
        questionIndex: snap.questionIndex,
        flipped: snap.flipped.slice(),
        team1: snap.team1,
        team2: snap.team2,
        boardRound: snap.boardRound,
        wrong: snap.wrong,
        questionOrder: Array.isArray(snap.questionOrder)
            ? snap.questionOrder.slice()
            : [],
    }),

    getSnapshot: () =>
        app.cloneSnapshot({
            questionIndex: app.currentQ,
            flipped: app.flippedState,
            team1: app.team1Score,
            team2: app.team2Score,
            boardRound: app.boardRoundScore,
            wrong: app.wrong,
            questionOrder: app.questions,
        }),

    mergeQuestionOrderFromSnapshot: (rawSnap) => {
        var keys = Object.keys(app.allData);
        if (
            !rawSnap ||
            !Array.isArray(rawSnap.questionOrder) ||
            rawSnap.questionOrder.length === 0
        ) {
            if (!app.questions.length) app.questions = keys.slice();
            return;
        }
        var seen = {};
        var ordered = [];
        rawSnap.questionOrder.forEach(function (k) {
            if (app.allData[k] && !seen[k]) {
                seen[k] = true;
                ordered.push(k);
            }
        });
        keys.forEach(function (k) {
            if (!seen[k]) ordered.push(k);
        });
        app.questions = ordered;
    },

    normalizeSnapshot: (snap) => {
        if (!snap || typeof snap !== 'object') return null;
        var maxQ = app.questions.length - 1;
        var q = snap.questionIndex;
        if (typeof q !== 'number' || isNaN(q)) q = 0;
        q = Math.max(0, Math.min(q, maxQ));

        var flipped = Array.isArray(snap.flipped)
            ? snap.flipped.slice(0, app.SLOT_COUNT)
            : [];
        while (flipped.length < app.SLOT_COUNT) flipped.push(false);

        return {
            questionIndex: q,
            flipped: flipped,
            team1: Number(snap.team1) || 0,
            team2: Number(snap.team2) || 0,
            boardRound: Number(snap.boardRound) || 0,
            wrong: Math.max(0, Number(snap.wrong) || 0),
        };
    },

    computeBoardRound: (questionIndex, flipped) => {
        var qText = app.questions[questionIndex];
        if (!qText || !app.allData[qText]) return 0;
        var qAnswr = app.allData[qText];
        var sum = 0;
        for (var i = 0; i < app.SLOT_COUNT; i++) {
            if (flipped[i] && qAnswr[i]) {
                sum += parseInt(qAnswr[i][1], 10) || 0;
            }
        }
        return sum;
    },

    syncScoreDOM: () => {
        app.board.find('#boardScore').html(app.boardRoundScore);
        app.board.find('#team1 .teamValue').html(app.team1Score);
        app.board.find('#team2 .teamValue').html(app.team2Score);
    },

    syncWrongVisual: () => {
        var wrongEl = app.board.find('.wrongBoard');
        var imgs = wrongEl.find('img');
        imgs.hide();
        var w = app.wrong;
        for (var k = 1; k <= w && k <= 3; k++) {
            imgs.eq(k - 1).show();
        }
        wrongEl.toggle(w > 0);
    },

    showWrongFlash: () => {
        var overlay = app.board.find('.wrongFlashOverlay');
        overlay.addClass('is-visible');
        if (app.wrongFlashHideTimer) clearTimeout(app.wrongFlashHideTimer);
        app.wrongFlashHideTimer = setTimeout(() => {
            overlay.removeClass('is-visible');
            app.wrongFlashHideTimer = null;
        }, 3000);
    },

    prepareCardTransforms: () => {
        var cardHolders = app.board.find('.cardHolder');
        var cards = app.board.find('.card');
        var backs = app.board.find('.back');
        var cardSides = app.board.find('.card>div');

        TweenLite.set(cardHolders, { perspective: 800 });
        TweenLite.set(cards, { transformStyle: 'preserve-3d' });
        TweenLite.set(backs, { rotationX: 180 });
        TweenLite.set(cardSides, { backfaceVisibility: 'hidden' });
    },

    syncSingleCard: (index, flipped, animate) => {
        var card = app.board.find('.card[data-id="' + index + '"]');
        if (!card.length) return;

        TweenLite.killTweensOf(card);
        var rotationX = flipped ? -180 : 0;
        if (animate) {
            TweenLite.to(card, 0.35, {
                rotationX: rotationX,
                ease: Back.easeOut,
            });
        } else {
            TweenLite.set(card, { rotationX: rotationX });
        }
        card.data('flipped', flipped);
    },

    syncAllCards: (prevFlipped, animate) => {
        var animateCards = !!animate;
        for (var i = 0; i < app.SLOT_COUNT; i++) {
            var target = app.flippedState[i];
            var changed =
                !prevFlipped ||
                prevFlipped.length < app.SLOT_COUNT ||
                prevFlipped[i] !== target;
            app.syncSingleCard(i, target, animateCards && changed);
        }
    },

    applySnapshot: (rawSnap, opts) => {
        if (!app.allData) return;

        app.mergeQuestionOrderFromSnapshot(rawSnap);
        if (!app.questions.length) app.questions = Object.keys(app.allData);

        var snap = app.normalizeSnapshot(rawSnap);
        if (!snap) return;

        var o = opts || {};
        var animateCards = !!o.animateCards;

        var prevQ = app.currentQ;
        var prevFlipped = app.flippedState.slice();

        app.currentQ = snap.questionIndex;
        app.team1Score = snap.team1;
        app.team2Score = snap.team2;
        app.boardRoundScore = snap.boardRound;
        app.wrong = snap.wrong;
        app.flippedState = snap.flipped.slice();

        if (prevQ !== app.currentQ) {
            app.makeQuestion(app.currentQ);
            app.prepareCardTransforms();
            app.syncAllCards(null, false);
        } else {
            app.syncAllCards(prevFlipped, animateCards);
        }

        app.syncScoreDOM();
        app.syncWrongVisual();
    },

    jsonLoaded: (data) => {
        app.allData = data;
        app.questions = Object.keys(data);

        app.team1Score = 0;
        app.team2Score = 0;
        app.boardRoundScore = 0;
        app.wrong = 0;
        app.flippedState = Array(app.SLOT_COUNT).fill(false);
        app.currentQ = 0;

        app.makeQuestion(0);
        $('body').append(app.board);

        if (app.pendingListenPayload) {
            app.listenSocket(app.pendingListenPayload);
            app.pendingListenPayload = null;
        } else {
            app.syncScoreDOM();
            app.syncWrongVisual();
            app.syncAllCards(null, false);
        }
    },

    makeQuestion: (eNum) => {
        app.currentQ = eNum;

        var qText = app.questions[eNum];
        var qAnswr = app.allData[qText];

        var qNum = qAnswr.length;
        qNum = qNum < 8 ? 8 : qNum;
        qNum = qNum % 2 !== 0 ? qNum + 1 : qNum;

        var question = app.board.find('.question');
        var holderMain = app.board.find('.colHolder');

        question.html(qText.replace(/&x22;/gi, '"'));
        holderMain.empty();

        qNum = app.SLOT_COUNT;

        for (var i = 0; i < qNum; i++) {
            var aLI;
            if (qAnswr[i]) {
                aLI = $(`<div class='cardHolder'>
                            <div class='card' data-id='${i}'>
                                <div class='front'>
                                    <span class='DBG'>${i + 1}</span>
                                    <span class='answer'>${qAnswr[i][0]}</span>
                                </div>
                                <div class='back DBG'>
                                    <span>${qAnswr[i][0]}</span>
                                    <b class='LBG'>${qAnswr[i][1]}</b>
                                </div>
                            </div>
                        </div>`);
            } else {
                aLI = $(`<div class='cardHolder empty'><div></div></div>`);
            }

            aLI.on('click', { num: i }, app.onCardClicked);
            $(aLI).appendTo(holderMain);
        }

        app.prepareCardTransforms();
    },

    emitHost: (payload) => {
        if (app.role !== 'host') return;
        app.mergeQuestionOrderFromSnapshot(payload.snapshot);
        if (!app.questions.length) app.questions = Object.keys(app.allData);
        var snap = app.normalizeSnapshot(payload.snapshot);
        if (!snap) return;
        snap.questionOrder = app.questions.slice();
        app.socket.emit(
            'talking',
            Object.assign({}, payload, { snapshot: snap })
        );
    },

    onCardClicked: (e) => {
        if (app.role !== 'host') return;
        var num = e.data.num;

        var snap = app.getSnapshot();
        snap.flipped[num] = !snap.flipped[num];
        snap.boardRound = app.computeBoardRound(snap.questionIndex, snap.flipped);

        app.emitHost({
            trigger: 'flipCard',
            num: num,
            snapshot: snap,
        });
    },

    makeHost: () => {
        app.role = 'host';
        app.board.find('.hide').removeClass('hide');
        app.board.addClass('showHost');
        app.emitHost({
            trigger: 'hostAssigned',
            snapshot: app.getSnapshot(),
        });
    },

    listenSocket: (data) => {
        if (!data || !data.snapshot) return;

        if (!app.allData) {
            app.pendingListenPayload = data;
            return;
        }

        if (data.trigger === 'hostAssigned') {
            app.board.find('#hostBTN').remove();
        }

        var animateCards = data.trigger === 'flipCard';
        app.applySnapshot(data.snapshot, { animateCards: animateCards });

        if (data.trigger === 'wrongFlash') {
            app.showWrongFlash();
        }
    },

    init: () => {
        $.getJSON(app.jsonFile, app.jsonLoaded);

        app.board.find('#hostBTN').on('click', app.makeHost);

        app.board.find('#awardTeam1').on('click', () => {
            var snap = app.getSnapshot();
            snap.team1 += snap.boardRound;
            snap.boardRound = 0;
            app.emitHost({ trigger: 'awardTeam1', snapshot: snap });
        });

        app.board.find('#awardTeam2').on('click', () => {
            var snap = app.getSnapshot();
            snap.team2 += snap.boardRound;
            snap.boardRound = 0;
            app.emitHost({ trigger: 'awardTeam2', snapshot: snap });
        });

        app.board.find('#newQuestion').on('click', () => {
            var snap = app.getSnapshot();
            if (snap.questionIndex >= app.questions.length - 1) return;
            snap.questionIndex += 1;
            snap.flipped = Array(app.SLOT_COUNT).fill(false);
            snap.boardRound = 0;
            snap.wrong = 0;
            app.emitHost({ trigger: 'newQuestion', snapshot: snap });
        });

        app.board.find('#wrong').on('click', () => {
            var snap = app.getSnapshot();
            snap.team1 = 0;
            snap.team2 = 0;
            snap.boardRound = 0;
            app.emitHost({ trigger: 'reset-score', snapshot: snap });
        });

        app.board.find('#wrongFlashBtn').on('click', () => {
            if (app.role !== 'host') return;
            app.emitHost({
                trigger: 'wrongFlash',
                snapshot: app.getSnapshot(),
            });
        });

        app.socket.on('listening', app.listenSocket);
    },
};

app.init();
