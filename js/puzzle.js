import { state, BASE_COLORS } from './state.js';
import { updateDropCounts, restoreBoardState, createOrbElement, recycleOrbElement } from './board.js';
import { drawRoute } from './route.js';
import { updateButtonLabels } from './ui.js';

export function resetComboText() {
    state.comboCount = 0;
    document.getElementById('combo-text').innerText = '';
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ----------------------------------------------------
// イベントリスナーの登録（main.jsから呼び出し可能）
// ----------------------------------------------------
export function initPuzzleInput() {
    const boardEl = document.getElementById('board');
    boardEl.addEventListener('touchstart', handleInputStart, { passive: false });
    boardEl.addEventListener('mousedown', handleInputStart);
    document.addEventListener('touchmove', handleInputMove, { passive: false });
    document.addEventListener('mousemove', handleInputMove);
    document.addEventListener('touchend', handleInputEnd);
    document.addEventListener('mouseup', handleInputEnd);
}

function getEventPos(e) {
    return e.touches ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : { x: e.clientX, y: e.clientY };
}

function getGridPos(x, y, clamp = false) {
    const boardEl = document.getElementById('board');
    const rect = state.cachedBoardRect || boardEl.getBoundingClientRect();
    const cellW = state.cachedCellW || rect.width / state.COLS;
    const cellH = state.cachedCellH || rect.height / state.ROWS;
    let c = Math.floor((x - rect.left) / cellW);
    let r = Math.floor((y - rect.top) / cellH);

    if (clamp) {
        c = Math.max(0, Math.min(c, state.COLS - 1));
        r = Math.max(0, Math.min(r, state.ROWS - 1));
        return { r, c };
    }

    if (r >= 0 && r < state.ROWS && c >= 0 && c < state.COLS) return { r, c };
    return null;
}

export function handleInputStart(e) {
    if (state.isResolving) return;
    if (!e.target.closest('#board') && !e.target.classList.contains('orb')) return;
    e.preventDefault();

    const boardEl = document.getElementById('board');
    state.cachedBoardRect = boardEl.getBoundingClientRect();
    state.cachedCellW = state.cachedBoardRect.width / state.COLS;
    state.cachedCellH = state.cachedBoardRect.height / state.ROWS;

    let { x, y } = getEventPos(e);
    let targetPos = getGridPos(x, y, false);

    if (state.currentMode === 'puzzle' || state.currentMode === 'rearrange') {
        if (!targetPos || !e.target.classList.contains('orb')) return;
        state.currentDragCell = targetPos;
        state.draggedElement = state.board[state.currentDragCell.r][state.currentDragCell.c];
        if (!state.draggedElement) return;

        if (state.currentMode === 'rearrange' && state.dragRoute.length > 1) {
            state.draggedElement = null;
            state.currentDragCell = null;
            return;
        }

        state.isDragging = true;

        if (state.currentMode === 'puzzle') resetComboText();

        boardEl.style.overflow = 'visible';
        document.getElementById('board-area').style.zIndex = '30';

        if (state.currentMode === 'rearrange' && state.dragRoute.length <= 1) {
            state.dragRoute = [{ r: state.currentDragCell.r, c: state.currentDragCell.c }];
            const svg = document.getElementById('route-svg');
            if (svg) svg.innerHTML = '';
            if (state.routeAnimFrame) {
                cancelAnimationFrame(state.routeAnimFrame);
                state.routeAnimFrame = null;
            }
        }

        state.draggedElement.classList.add('dragging');
        updateDragPosition(x, y);

    } else if (state.currentMode === 'edit') {
        state.isPainting = true;
        state.lastPaintCellKey = '';
        state.paintUnmatchableTargetState = 'true';
        if (targetPos) {
            let el = state.board[targetPos.r][targetPos.c];
            if (state.selectedEditColor === 'unmatchable' && el) {
                state.paintUnmatchableTargetState = state.unmatchableColors.has(el.dataset.color) ? 'false' : 'true';
            }
            paintOrb(targetPos.r, targetPos.c);
        }
    }
}

export function handleInputMove(e) {
    if (state.isDragging || state.isPainting || e.target.closest('#board')) {
        if (e.cancelable) e.preventDefault();
    }

    if (state.isResolving || (!state.isDragging && !state.isPainting)) return;

    let { x, y } = getEventPos(e);
    let targetPos = getGridPos(x, y, true);

    if ((state.currentMode === 'puzzle' || state.currentMode === 'rearrange') && state.isDragging) {
        updateDragPosition(x, y);
        if (targetPos && (targetPos.r !== state.currentDragCell.r || targetPos.c !== state.currentDragCell.c)) {
            let targetEl = state.board[targetPos.r][targetPos.c];
            state.board[state.currentDragCell.r][state.currentDragCell.c] = targetEl;
            state.board[targetPos.r][targetPos.c] = state.draggedElement;

            if (targetEl) {
                targetEl.dataset.r = state.currentDragCell.r;
                targetEl.dataset.c = state.currentDragCell.c;
                targetEl.style.top = `${(state.currentDragCell.r / state.ROWS) * 100}%`;
                targetEl.style.left = `${(state.currentDragCell.c / state.COLS) * 100}%`;
            }
            state.currentDragCell = targetPos;

            if (state.currentMode === 'rearrange') {
                let lastObj = state.dragRoute[state.dragRoute.length - 1];
                if (lastObj.r !== targetPos.r || lastObj.c !== targetPos.c) {
                    if (state.dragRoute.length >= 2 &&
                        state.dragRoute[state.dragRoute.length - 2].r === targetPos.r &&
                        state.dragRoute[state.dragRoute.length - 2].c === targetPos.c) {
                        state.dragRoute.pop();
                    } else {
                        state.dragRoute.push({ r: targetPos.r, c: targetPos.c });
                    }
                }
            }
        }
    } else if (state.currentMode === 'edit' && state.isPainting) {
        let exactTargetPos = getGridPos(x, y, false);
        if (exactTargetPos) paintOrb(exactTargetPos.r, exactTargetPos.c);
    }
}

export function handleInputEnd() {
    if (state.currentMode === 'puzzle' || state.currentMode === 'rearrange') {
        if (!state.isDragging) return;
        state.isDragging = false;
        const boardEl = document.getElementById('board');
        boardEl.style.overflow = 'hidden';
        document.getElementById('board-area').style.zIndex = '10';

        state.draggedElement.classList.remove('dragging');
        state.draggedElement.dataset.r = state.currentDragCell.r;
        state.draggedElement.dataset.c = state.currentDragCell.c;
        state.draggedElement.style.top = `${(state.currentDragCell.r / state.ROWS) * 100}%`;
        state.draggedElement.style.left = `${(state.currentDragCell.c / state.COLS) * 100}%`;

        state.draggedElement = null;
        state.currentDragCell = null;

        if (state.currentMode === 'puzzle') {
            resolveMatches();
        } else if (state.currentMode === 'rearrange') {
            drawRoute();
            updateButtonLabels();
        }

    } else if (state.currentMode === 'edit') {
        state.isPainting = false;
        state.lastPaintCellKey = '';
    }
    state.cachedBoardRect = null;
    state.cachedCellW = 0;
    state.cachedCellH = 0;
}

function updateDragPosition(x, y) {
    const boardEl = document.getElementById('board');
    const rect = state.cachedBoardRect || boardEl.getBoundingClientRect();
    const cellW = state.cachedCellW || rect.width / state.COLS;
    const cellH = state.cachedCellH || rect.height / state.ROWS;
    let leftPx = (x - rect.left) - cellW / 2;
    let topPx = (y - rect.top) - cellH / 2;
    state.draggedElement.style.left = `${(leftPx / rect.width) * 100}%`;
    state.draggedElement.style.top = `${(topPx / rect.height) * 100}%`;
}

export function paintOrb(r, c) {
    const paintKey = `${r},${c},${state.selectedEditColor},${state.paintUnmatchableTargetState}`;
    if (state.currentMode === 'edit' && state.isPainting && state.lastPaintCellKey === paintKey) return;
    state.lastPaintCellKey = paintKey;

    let el = state.board[r][c];
    if (!el) {
        if (state.selectedEditColor !== 'unmatchable') {
            let newEl = createOrbElement(state.selectedEditColor, r, c);
            newEl.style.top = `${(r / state.ROWS) * 100}%`;
            newEl.style.left = `${(c / state.COLS) * 100}%`;
            state.board[r][c] = newEl;
            document.getElementById('board').appendChild(newEl);
        }
    } else {
        if (state.selectedEditColor === 'unmatchable') {
            let targetColor = el.dataset.color;
            if (state.paintUnmatchableTargetState === 'true') state.unmatchableColors.add(targetColor);
            else state.unmatchableColors.delete(targetColor);
            syncUnmatchableDisplay();
        } else {
            el.className = 'orb ' + state.selectedEditColor;
            el.dataset.color = state.selectedEditColor;
            if (state.unmatchableColors.has(state.selectedEditColor)) {
                el.classList.add('unmatchable');
                el.dataset.unmatchable = 'true';
            } else {
                el.classList.remove('unmatchable');
                el.dataset.unmatchable = 'false';
            }
        }
    }
    updateDropCounts();
}

function syncUnmatchableDisplay() {
    for (let r = 0; r < state.ROWS; r++) {
        for (let c = 0; c < state.COLS; c++) {
            let orb = state.board[r][c];
            if (orb) {
                if (state.unmatchableColors.has(orb.dataset.color)) {
                    orb.classList.add('unmatchable');
                    orb.dataset.unmatchable = 'true';
                } else {
                    orb.classList.remove('unmatchable');
                    orb.dataset.unmatchable = 'false';
                }
            }
        }
    }
}

// ----------------------------------------------------
// 連鎖処理
// ----------------------------------------------------
export async function resolveMatches() {
    state.resolveId++;
    const currentResolveId = state.resolveId;
    state.isResolving = true;

    let isOchiconEnabled = document.getElementById('ochicon-toggle').checked;
    let comboDelayMs = parseFloat(document.getElementById('combo-speed-slider').value) * 1000;

    let initialGroups = findComboGroups();
    let matchedBombs = new Set();

    initialGroups.forEach(group => {
        let firstEl = state.board[group[0].r][group[0].c];
        if (firstEl && firstEl.dataset.color === 'bom') {
            group.forEach(pos => matchedBombs.add(`${pos.r},${pos.c}`));
        }
    });

    let isolatedBombs = [];
    for (let r = 0; r < state.ROWS; r++) {
        for (let c = 0; c < state.COLS; c++) {
            let el = state.board[r][c];
            if (el && el.dataset.color === 'bom' && !matchedBombs.has(`${r},${c}`)) {
                isolatedBombs.push({ r, c });
            }
        }
    }

    let bombExplodedThisTurn = false;
    if (isolatedBombs.length > 0) {
        let blastRadius = new Set();
        isolatedBombs.forEach(b => {
            for (let r = 0; r < state.ROWS; r++) blastRadius.add(`${r},${b.c}`);
            for (let c = 0; c < state.COLS; c++) blastRadius.add(`${b.r},${c}`);
        });

        blastRadius.forEach(coord => {
            if (matchedBombs.has(coord)) return;

            let [r, c] = coord.split(',').map(Number);
            let el = state.board[r][c];
            if (el) {
                el.classList.add('exploded');
                state.board[r][c] = null;

                el.__recycleTimeout = setTimeout(() => {
                    el.__recycleTimeout = null;
                    recycleOrbElement(el);
                }, 250);

                bombExplodedThisTurn = true;
            }
        });
        if (bombExplodedThisTurn) {
            if (currentResolveId !== state.resolveId) return;
            await sleep(250);
            if (currentResolveId !== state.resolveId) return;
        }
    }

    let matched = true;

    while (matched) {
        if (currentResolveId !== state.resolveId) return;

        if (state.comboCount >= 64) {
            matched = false;
            break;
        }

        let comboGroups = findComboGroups();

        if (comboGroups.length === 0) {
            if (bombExplodedThisTurn) {
                await applyGravity(isOchiconEnabled, currentResolveId);
                if (currentResolveId !== state.resolveId) return;
                await sleep(100);
                if (currentResolveId !== state.resolveId) return;
                bombExplodedThisTurn = false;
                continue;
            }
            matched = false;
            break;
        }
        bombExplodedThisTurn = false;

        let curedThisTurn = false;
        for (let group of comboGroups) {
            if (group.length === 4) {
                let firstEl = state.board[group[0].r][group[0].c];
                if (firstEl && ['red', 'blue', 'green', 'yellow', 'purple'].includes(firstEl.dataset.color)) {
                    curedThisTurn = true;
                }
            }
        }

        if (curedThisTurn) {
            state.unmatchableColors.clear();
            syncUnmatchableDisplay();
        }

        comboGroups.sort((a, b) => {
            let aMaxR = Math.max(...a.map(o => o.r));
            let aMinC = Math.min(...a.filter(o => o.r === aMaxR).map(o => o.c));
            let bMaxR = Math.max(...b.map(o => o.r));
            let bMinC = Math.min(...b.filter(o => o.r === bMaxR).map(o => o.c));
            if (aMaxR !== bMaxR) return bMaxR - aMaxR;
            return aMinC - bMinC;
        });

        for (let group of comboGroups) {
            if (currentResolveId !== state.resolveId) return;

            state.comboCount++;
            document.getElementById('combo-text').innerText = `${state.comboCount} Combo!`;

            group.forEach(m => {
                let el = state.board[m.r][m.c];
                if (el) {
                    el.style.transform = 'scale(0)';
                    el.style.opacity = '0';
                    state.board[m.r][m.c] = null;

                    el.__recycleTimeout = setTimeout(() => {
                        el.__recycleTimeout = null;
                        recycleOrbElement(el);
                    }, 250);
                }
            });
            await sleep(comboDelayMs);
        }

        if (currentResolveId !== state.resolveId) return;
        await sleep(100);

        if (currentResolveId !== state.resolveId) return;
        await applyGravity(isOchiconEnabled, currentResolveId);

        if (currentResolveId !== state.resolveId) return;
        await sleep(100);
    }

    if (currentResolveId === state.resolveId) {
        setTimeout(() => {
            if (currentResolveId === state.resolveId) {
                restoreBoardState(true);
                state.isResolving = false;
            }
        }, 1000);
    }
}

function findComboGroups() {
    let removeFlags = Array.from({ length: state.ROWS }, () => new Array(state.COLS).fill(false));

    for (let r = 0; r < state.ROWS; r++) {
        for (let c = 0; c <= state.COLS - 3; c++) {
            let el = state.board[r][c];
            if (!el || el.dataset.unmatchable === 'true') continue;
            let color = el.dataset.color;
            let len = 1;
            while (c + len < state.COLS && state.board[r][c + len] && state.board[r][c + len].dataset.color === color && state.board[r][c + len].dataset.unmatchable !== 'true') len++;
            if (len >= 3) {
                for (let i = 0; i < len; i++) removeFlags[r][c + i] = true;
            }
        }
    }

    for (let c = 0; c < state.COLS; c++) {
        for (let r = 0; r <= state.ROWS - 3; r++) {
            let el = state.board[r][c];
            if (!el || el.dataset.unmatchable === 'true') continue;
            let color = el.dataset.color;
            let len = 1;
            while (r + len < state.ROWS && state.board[r + len][c] && state.board[r + len][c].dataset.color === color && state.board[r + len][c].dataset.unmatchable !== 'true') len++;
            if (len >= 3) {
                for (let i = 0; i < len; i++) removeFlags[r + i][c] = true;
            }
        }
    }

    let visited = Array.from({ length: state.ROWS }, () => new Array(state.COLS).fill(false));
    let groups = [];

    for (let r = 0; r < state.ROWS; r++) {
        for (let c = 0; c < state.COLS; c++) {
            if (removeFlags[r][c] && !visited[r][c]) {
                let color = state.board[r][c].dataset.color;
                let group = [];
                let queue = [{ r, c }];
                visited[r][c] = true;

                while (queue.length > 0) {
                    let curr = queue.shift();
                    group.push(curr);
                    let dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
                    for (let [dr, dc] of dirs) {
                        let nr = curr.r + dr;
                        let nc = curr.c + dc;
                        if (nr >= 0 && nr < state.ROWS && nc >= 0 && nc < state.COLS) {
                            if (removeFlags[nr][nc] && !visited[nr][nc] && state.board[nr][nc] && state.board[nr][nc].dataset.color === color) {
                                visited[nr][nc] = true;
                                queue.push({ r: nr, c: nc });
                            }
                        }
                    }
                }
                if (group.length >= state.minMatchCount) {
                    groups.push(group);
                }
            }
        }
    }
    return groups;
}

export async function applyGravity(spawnNew, currentResolveId) {
    let speedStr = document.documentElement.style.getPropertyValue('--fall-speed') || '0.1s';
    let fallTimeMs = parseFloat(speedStr) * 1000;
    let moved = false;
    const boardEl = document.getElementById('board');
    const spawnFragment = document.createDocumentFragment();
    let newSpawnedOrbs = [];

    let fallColors = state.activeSpawnColors.filter(color => color !== 'bom');
    if (fallColors.length === 0) fallColors = BASE_COLORS;

    for (let c = 0; c < state.COLS; c++) {
        let emptyCount = 0;

        for (let r = state.ROWS - 1; r >= 0; r--) {
            let el = state.board[r][c];
            if (!el) {
                emptyCount++;
            } else if (emptyCount > 0) {
                state.board[r + emptyCount][c] = el;
                state.board[r][c] = null;
                el.dataset.r = r + emptyCount;
                el.classList.add('falling');
                el.style.top = `${((r + emptyCount) / state.ROWS) * 100}%`;
                moved = true;
            }
        }

        if (spawnNew) {
            for (let r = 0; r < emptyCount; r++) {
                let newColor = fallColors[Math.floor(Math.random() * fallColors.length)];
                let newEl = createOrbElement(newColor, r, c);

                newEl.style.transition = 'none';
                newEl.style.top = `${((r - emptyCount) / state.ROWS) * 100}%`;
                newEl.style.left = `${(c / state.COLS) * 100}%`;
                state.board[r][c] = newEl;
                spawnFragment.appendChild(newEl);

                newSpawnedOrbs.push({ el: newEl, targetTop: `${(r / state.ROWS) * 100}%` });
                moved = true;
            }
        }
    }

    boardEl.appendChild(spawnFragment);

    if (newSpawnedOrbs.length > 0) {
        boardEl.offsetHeight;
        newSpawnedOrbs.forEach(item => {
            item.el.style.transition = '';
            item.el.classList.add('falling');
            item.el.style.top = item.targetTop;
        });
    }

    if (moved) {
        if (currentResolveId && currentResolveId !== state.resolveId) return;
        await sleep(fallTimeMs + 50);
        if (currentResolveId && currentResolveId !== state.resolveId) return;
        state.board.forEach(row => row.forEach(el => el && el.classList.remove('falling')));
    }
}

// ----------------------------------------------------
// 自動再生
// ----------------------------------------------------
export function startAutoplay() {
    let route = state.dragRoute;
    let startPos = route[0];
    let movingOrb = state.board[startPos.r][startPos.c];

    if (!movingOrb) {
        state.isResolving = false;
        return;
    }

    movingOrb.classList.add('dragging');
    movingOrb.style.transition = 'none';

    let speedMs = parseFloat(document.getElementById('autoplay-speed-slider').value) * 1000;
    let totalTime = (route.length - 1) * speedMs;
    let autoPlayStartTime = null;
    let lastIndex = 0;

    function autoPlayStep(time) {
        if (!state.isResolving) {
            movingOrb.style.transition = '';
            movingOrb.classList.remove('dragging');
            return;
        }

        if (autoPlayStartTime === null) autoPlayStartTime = time;

        let elapsed = Math.max(0, time - autoPlayStartTime);
        let progress = totalTime > 0 ? Math.min(1, elapsed / totalTime) : 1;

        let floatIndex = progress * (route.length - 1);
        let currentIndex = Math.floor(floatIndex);

        if (currentIndex >= route.length - 1 && progress === 1) {
            currentIndex = route.length - 2;
        }
        let nextIndex = currentIndex + 1;
        let fraction = floatIndex - currentIndex;

        let p1 = route[currentIndex];
        let p2 = route[nextIndex];
        let currentR = p1.r + (p2.r - p1.r) * fraction;
        let currentC = p1.c + (p2.c - p1.c) * fraction;

        movingOrb.style.top = `${(currentR / state.ROWS) * 100}%`;
        movingOrb.style.left = `${(currentC / state.COLS) * 100}%`;

        while (lastIndex < currentIndex) {
            lastIndex++;
            let prevPos = route[lastIndex - 1];
            let curPos = route[lastIndex];

            let targetEl = state.board[curPos.r][curPos.c];

            state.board[prevPos.r][prevPos.c] = targetEl;
            state.board[curPos.r][curPos.c] = movingOrb;

            if (targetEl) {
                targetEl.dataset.r = prevPos.r;
                targetEl.dataset.c = prevPos.c;
                targetEl.style.top = `${(prevPos.r / state.ROWS) * 100}%`;
                targetEl.style.left = `${(prevPos.c / state.COLS) * 100}%`;
            }
        }

        if (progress < 1) {
            requestAnimationFrame(autoPlayStep);
        } else {
            while (lastIndex < route.length - 1) {
                lastIndex++;
                let prevPos = route[lastIndex - 1];
                let curPos = route[lastIndex];
                let targetEl = state.board[curPos.r][curPos.c];
                state.board[prevPos.r][prevPos.c] = targetEl;
                state.board[curPos.r][curPos.c] = movingOrb;
                if (targetEl) {
                    targetEl.dataset.r = prevPos.r;
                    targetEl.dataset.c = prevPos.c;
                    targetEl.style.top = `${(prevPos.r / state.ROWS) * 100}%`;
                    targetEl.style.left = `${(prevPos.c / state.COLS) * 100}%`;
                }
            }

            movingOrb.classList.remove('dragging');
            movingOrb.style.transition = '';
            movingOrb.dataset.r = route[route.length - 1].r;
            movingOrb.dataset.c = route[route.length - 1].c;

            resetComboText();
            resolveMatches();
        }
    }
    requestAnimationFrame(autoPlayStep);
}