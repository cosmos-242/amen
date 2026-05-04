import { state, ALL_COLORS } from './state.js';
import { resetComboText } from './puzzle.js';

export function initDropCountDisplay() {
    const container = document.getElementById('drop-counts');
    container.innerHTML = '';
    const fragment = document.createDocumentFragment();

    ALL_COLORS.forEach(color => {
        if (color === 'unmatchable') return;
        const item = document.createElement('div');
        item.className = 'count-item';
        item.style.display = 'none';

        const icon = document.createElement('div');
        icon.className = `mini-orb ${color}`;

        const text = document.createElement('span');
        text.innerText = '×0';

        item.appendChild(icon);
        item.appendChild(text);
        fragment.appendChild(item);
        state.dropCountElements[color] = { item, text };
    });

    container.appendChild(fragment);
}

export function updateDropCounts() {
    if (state.dropCountsQueued) return;
    state.dropCountsQueued = true;
    requestAnimationFrame(() => {
        state.dropCountsQueued = false;
        updateDropCountsNow();
    });
}

function updateDropCountsNow() {
    if (!document.getElementById('count-toggle').checked) return;

    const counts = {};
    Object.keys(state.dropCountElements).forEach(color => counts[color] = 0);

    for (let r = 0; r < state.ROWS; r++) {
        for (let c = 0; c < state.COLS; c++) {
            if (state.board[r][c]) {
                let color = state.board[r][c].dataset.color;
                if (counts[color] !== undefined) counts[color]++;
            }
        }
    }

    Object.keys(state.dropCountElements).forEach(color => {
        const entry = state.dropCountElements[color];
        const count = counts[color] || 0;
        entry.text.innerText = `×${count}`;
        entry.item.style.display = count > 0 ? 'flex' : 'none';
    });
}

export function saveCurrentBoardState() {
    for (let r = 0; r < state.ROWS; r++) {
        for (let c = 0; c < state.COLS; c++) {
            state.savedBoardColors[r][c] = state.board[r][c] ? state.board[r][c].dataset.color : null;
        }
    }
    state.savedUnmatchableColors = new Set(state.unmatchableColors);
}

export function mirrorBoardColors(colors2D) {
    return colors2D.map(row => [...row].reverse());
}

export function createBoard() {
    const boardEl = document.getElementById('board');
    boardEl.classList.add('no-transition');

    if (!state.board || state.board.length !== state.ROWS || state.board[0]?.length !== state.COLS) {
        boardEl.querySelectorAll('.orb').forEach(recycleOrbElement);
        state.board = Array.from({ length: state.ROWS }, () => new Array(state.COLS).fill(null));
        state.savedBoardColors = Array.from({ length: state.ROWS }, () => new Array(state.COLS).fill(null));
    }

    state.unmatchableColors.clear();
    state.savedUnmatchableColors.clear();

    for (let r = 0; r < state.ROWS; r++) {
        for (let c = 0; c < state.COLS; c++) {
            let color;
            let retries = 0;
            do {
                color = state.activeSpawnColors[Math.floor(Math.random() * state.activeSpawnColors.length)];
                retries++;
                if (state.activeSpawnColors.length < 3 || retries > 20) break;
            } while (
                (r >= 2 && state.board[r - 1][c]?.dataset.color === color && state.board[r - 2][c]?.dataset.color === color) ||
                (c >= 2 && state.board[r][c - 1]?.dataset.color === color && state.board[r][c - 2]?.dataset.color === color)
            );

            let el = state.board[r][c];
            if (!el) {
                el = createOrbElement(color, r, c);
                state.board[r][c] = el;
                boardEl.appendChild(el);
            } else {
                if (el.__recycleTimeout) {
                    clearTimeout(el.__recycleTimeout);
                    el.__recycleTimeout = null;
                }
                el.className = 'orb ' + color;
                el.dataset.color = color;
                el.style.transform = '';
                el.style.opacity = '1';
                el.classList.remove('unmatchable');
                el.dataset.unmatchable = 'false';
            }

            el.dataset.r = r;
            el.dataset.c = c;
            el.style.top = `${(r / state.ROWS) * 100}%`;
            el.style.left = `${(c / state.COLS) * 100}%`;

            state.savedBoardColors[r][c] = color;
        }
    }
    resetComboText();
    updateDropCounts();

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            boardEl.classList.remove('no-transition');
        });
    });
}

export function restoreBoardState(keepCombo = false) {
    const boardEl = document.getElementById('board');
    boardEl.classList.add('no-transition');

    if (!state.board || state.board.length !== state.ROWS || state.board[0]?.length !== state.COLS) {
        boardEl.querySelectorAll('.orb').forEach(recycleOrbElement);
        state.board = Array.from({ length: state.ROWS }, () => new Array(state.COLS).fill(null));
    }

    state.unmatchableColors = new Set(state.savedUnmatchableColors);

    for (let r = 0; r < state.ROWS; r++) {
        for (let c = 0; c < state.COLS; c++) {
            let color = (state.savedBoardColors[r] && state.savedBoardColors[r][c]) ? state.savedBoardColors[r][c] : null;
            let el = state.board[r][c];

            if (color) {
                if (!el) {
                    el = createOrbElement(color, r, c);
                    state.board[r][c] = el;
                    boardEl.appendChild(el);
                } else {
                    if (el.__recycleTimeout) {
                        clearTimeout(el.__recycleTimeout);
                        el.__recycleTimeout = null;
                    }
                    el.className = 'orb ' + color;
                    el.dataset.color = color;
                    el.style.transform = '';
                    el.style.opacity = '1';

                    if (state.unmatchableColors.has(color)) {
                        el.classList.add('unmatchable');
                        el.dataset.unmatchable = 'true';
                    } else {
                        el.classList.remove('unmatchable');
                        el.dataset.unmatchable = 'false';
                    }
                }

                el.dataset.r = r;
                el.dataset.c = c;
                el.style.top = `${(r / state.ROWS) * 100}%`;
                el.style.left = `${(c / state.COLS) * 100}%`;

            } else if (el) {
                recycleOrbElement(el);
                state.board[r][c] = null;
            }
        }
    }
    if (!keepCombo) {
        resetComboText();
    }
    updateDropCounts();

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            boardEl.classList.remove('no-transition');
        });
    });
}

export function recycleOrbElement(el) {
    if (!el || el.__inPool) return;
    if (el.__recycleTimeout) {
        clearTimeout(el.__recycleTimeout);
        el.__recycleTimeout = null;
    }
    if (el.parentNode) el.parentNode.removeChild(el);
    el.__inPool = true;
    el.className = 'orb';
    el.style.transform = '';
    el.style.opacity = '';
    el.style.transition = '';
    el.style.top = '';
    el.style.left = '';
    el.style.width = '';
    el.style.height = '';
    delete el.dataset.color;
    delete el.dataset.r;
    delete el.dataset.c;
    delete el.dataset.unmatchable;
    state.orbPool.push(el);
}

export function createOrbElement(color, r, c) {
    let el = state.orbPool.pop() || document.createElement('div');
    el.__inPool = false;
    el.className = 'orb ' + color;
    el.dataset.color = color;
    el.dataset.r = r;
    el.dataset.c = c;

    if (state.unmatchableColors.has(color)) {
        el.classList.add('unmatchable');
        el.dataset.unmatchable = 'true';
    } else {
        el.dataset.unmatchable = 'false';
    }

    el.style.width = `${100 / state.COLS}%`;
    el.style.height = `${100 / state.ROWS}%`;
    return el;
}

// --- ルーレット処理 ---
export function syncRouletteDisplay() {
    // 1. ルーレットを閉じ込める「背景専用レイヤー」を探すか、新規作成する
    let bgLayer = document.getElementById('board-bg-layer');
    if (!bgLayer) {
        bgLayer = document.createElement('div');
        bgLayer.id = 'board-bg-layer';
        // このレイヤーの z-index を 0 に固定することで、中のバグごとドロップ(3)の裏に隔離する
        bgLayer.style.position = 'absolute';
        bgLayer.style.top = '0';
        bgLayer.style.left = '0';
        bgLayer.style.width = '100%';
        bgLayer.style.height = '100%';
        bgLayer.style.zIndex = '0';
        bgLayer.style.pointerEvents = 'none';
        document.getElementById('board').prepend(bgLayer);
    }

    // 2. 古い要素をクリア（レイヤーの中身を空にする）
    bgLayer.innerHTML = '';

    // 解決中（コンボ中）はタイマーだけ回して描画はしない
    if (state.isResolving) {
        restartRouletteTimer();
        return;
    }

    state.rouletteCells.forEach(key => {
        let [r, c] = key.split(',').map(Number);

        // ゲージ（白半透明）を生成して「背景レイヤー」に入れる
        let bg = document.createElement('div');
        bg.className = 'roulette-bg';
        bg.style.top = `${(r / state.ROWS) * 100}%`;
        bg.style.left = `${(c / state.COLS) * 100}%`;
        bg.style.width = `${100 / state.COLS}%`;
        bg.style.height = `${100 / state.ROWS}%`;
        bgLayer.appendChild(bg);

        // 装飾枠（画像）を生成して「背景レイヤー」に入れる
        let frame = document.createElement('div');
        frame.className = 'roulette-frame';
        frame.style.top = `${(r / state.ROWS) * 100}%`;
        frame.style.left = `${(c / state.COLS) * 100}%`;
        frame.style.width = `${100 / state.COLS}%`;
        frame.style.height = `${100 / state.ROWS}%`;
        bgLayer.appendChild(frame);
    });

    restartRouletteTimer();
}

export function toggleRouletteVisibility(isVisible) {
    let bgLayer = document.getElementById('board-bg-layer');
    if (bgLayer) {
        bgLayer.style.display = isVisible ? 'block' : 'none';
    }

    if (isVisible) {
        restartRouletteTimer();
    } else {
        if (state.rouletteTimer) {
            clearInterval(state.rouletteTimer);
            state.rouletteTimer = null;
        }
    }
}
export function restartRouletteTimer() {
    if (state.rouletteTimer) {
        clearInterval(state.rouletteTimer);
        state.rouletteTimer = null;
    }
    if (state.rouletteCells.size === 0) return;

    document.documentElement.style.setProperty('--roulette-speed', state.rouletteSpeed + 's');

    document.querySelectorAll('.roulette-bg').forEach(bg => {
        bg.style.animation = 'none';
        void bg.offsetWidth;
        bg.style.animation = '';
    });

    state.rouletteTimer = setInterval(() => {
        if (state.isResolving || state.rouletteSequence.length === 0) return;

        document.querySelectorAll('.roulette-bg').forEach(bg => {
            bg.style.animation = 'none';
            void bg.offsetWidth; // リフロー強制
            bg.style.animation = '';
        });

        state.rouletteCells.forEach(key => {
            let [r, c] = key.split(',').map(Number);
            let el = state.board[r][c];

            // 掴まれていない、かつ落下中ではない場合のみ変化
            if (el && state.draggedElement !== el && !el.classList.contains('falling')) {
                let currentColor = el.dataset.color;
                let currentIndex = state.rouletteSequence.indexOf(currentColor);

                // 現在の色がルーレット設定に含まれていれば次の色へ。なければ最初の色へ。
                let nextIndex = 0;
                if (currentIndex !== -1) {
                    nextIndex = (currentIndex + 1) % state.rouletteSequence.length;
                }

                let nextColor = state.rouletteSequence[nextIndex];
                let isUnmatchable = el.dataset.unmatchable === 'true';

                el.style.transition = 'none';

                el.className = 'orb ' + nextColor + (isUnmatchable ? ' unmatchable' : '');
                el.dataset.color = nextColor;

                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        el.style.transition = '';
                    });
                });
            }
        });
        updateDropCounts();
    }, state.rouletteSpeed * 1000);
}