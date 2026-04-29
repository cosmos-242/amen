import { state } from './state.js';
import { initDropCountDisplay, createBoard, restoreBoardState, saveCurrentBoardState, recycleOrbElement } from './board.js';
import { drawRoute } from './route.js';
import { updateButtonLabels } from './ui.js';

export function saveToStorage() {
    if (state.currentMode === 'edit') saveCurrentBoardState();

    const data = {
        settings: {
            cols: state.COLS,
            rows: state.ROWS,
            activeSpawnColors: state.activeSpawnColors,
            minMatchCount: state.minMatchCount,
            ochicon: document.getElementById('ochicon-toggle').checked,
            count: document.getElementById('count-toggle').checked,
            comboSpeed: document.getElementById('combo-speed-slider').value,
            speed: document.getElementById('speed-slider').value,
            swapSpeed: document.getElementById('swap-speed-slider').value,
            autoplaySpeed: document.getElementById('autoplay-speed-slider').value,
            routeWidth: document.getElementById('route-width-slider').value
        },
        boardColors: state.savedBoardColors,
        unmatchable: Array.from(state.savedUnmatchableColors),
        route: state.dragRoute
    };
    localStorage.setItem('padBoardEditorData', JSON.stringify(data));
}

export function loadFromStorage() {
    const raw = localStorage.getItem('padBoardEditorData');
    initDropCountDisplay();

    if (raw) {
        try {
            const data = JSON.parse(raw);

            if (data.settings) {
                state.COLS = data.settings.cols || 6;
                state.ROWS = data.settings.rows || 5;
                document.documentElement.style.setProperty('--cols', state.COLS);
                document.documentElement.style.setProperty('--rows', state.ROWS);

                document.querySelectorAll('.size-tab').forEach(t => {
                    t.classList.remove('active');
                    if (parseInt(t.dataset.cols) === state.COLS) t.classList.add('active');
                });

                if (data.settings.activeSpawnColors) state.activeSpawnColors = data.settings.activeSpawnColors;
                document.querySelectorAll('#spawn-settings input').forEach(cb => {
                    cb.checked = state.activeSpawnColors.includes(cb.value);
                });

                state.minMatchCount = data.settings.minMatchCount || 3;
                document.getElementById('min-4-toggle').checked = (state.minMatchCount === 4);
                document.getElementById('min-5-toggle').checked = (state.minMatchCount === 5);

                document.getElementById('ochicon-toggle').checked = !!data.settings.ochicon;
                document.getElementById('count-toggle').checked = (data.settings.count !== false);
                if (!document.getElementById('count-toggle').checked) document.getElementById('drop-counts').classList.add('hidden');

                if (data.settings.comboSpeed) { document.getElementById('combo-speed-slider').value = data.settings.comboSpeed; document.getElementById('combo-speed-display').innerText = parseFloat(data.settings.comboSpeed).toFixed(2); }
                if (data.settings.speed) { document.getElementById('speed-slider').value = data.settings.speed; document.getElementById('speed-display').innerText = parseFloat(data.settings.speed).toFixed(1); document.documentElement.style.setProperty('--fall-speed', data.settings.speed + 's'); }
                if (data.settings.swapSpeed) { document.getElementById('swap-speed-slider').value = data.settings.swapSpeed; document.getElementById('swap-speed-display').innerText = parseFloat(data.settings.swapSpeed).toFixed(2); document.documentElement.style.setProperty('--swap-speed', data.settings.swapSpeed + 's'); }
                if (data.settings.autoplaySpeed) { document.getElementById('autoplay-speed-slider').value = data.settings.autoplaySpeed; document.getElementById('autoplay-speed-display').innerText = parseFloat(data.settings.autoplaySpeed).toFixed(2); }
                if (data.settings.routeWidth) { document.getElementById('route-width-slider').value = data.settings.routeWidth; document.getElementById('route-width-display').innerText = parseFloat(data.settings.routeWidth).toFixed(2); state.routeWidthBase = parseFloat(data.settings.routeWidth); }
            }

            if (data.boardColors && data.boardColors.length === state.ROWS && data.boardColors[0].length === state.COLS) {
                const modal = document.getElementById('restore-modal');
                modal.classList.add('active');

                document.getElementById('restore-yes-btn').onclick = () => {
                    modal.classList.remove('active');
                    state.savedBoardColors = data.boardColors;
                    state.savedUnmatchableColors = new Set(data.unmatchable || []);
                    state.unmatchableColors = new Set(state.savedUnmatchableColors);
                    if (data.route) state.dragRoute = data.route;

                    document.getElementById('board').querySelectorAll('.orb').forEach(recycleOrbElement);
                    state.board = Array.from({ length: state.ROWS }, () => new Array(state.COLS).fill(null));

                    restoreBoardState(true);
                    drawRoute();
                    updateButtonLabels();
                };

                document.getElementById('restore-no-btn').onclick = () => {
                    modal.classList.remove('active');
                    state.dragRoute = [];
                    createBoard();
                    updateButtonLabels();
                    saveToStorage();
                };

                return;
            }
        } catch (e) {
            console.error("Storage load error", e);
        }
    }

    createBoard();
    updateButtonLabels();
}