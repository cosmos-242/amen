import { state, BASE_COLORS, SPAWNABLE_COLORS, ALL_COLORS } from './state.js';
import {
    createBoard,
    restoreBoardState,
    updateDropCounts,
    saveCurrentBoardState,
    mirrorBoardColors,
    recycleOrbElement
} from './board.js';
import {
    drawRoute,
    setRouteLayerVisibility,
    computeBoardAfterRoute,
    mirrorRoute
} from './route.js';
import { startAutoplay, resetComboText } from './puzzle.js';
import { saveToStorage } from './storage.js';

export function updateButtonLabels() {
    const newBoardBtn = document.getElementById('new-board-btn');
    const resetBtn = document.getElementById('reset-btn');
    const toggleBtn = document.getElementById('toggle-route-btn');
    const reverseBtn = document.getElementById('reverse-route-btn');
    const autoplayBtn = document.getElementById('autoplay-btn');
    const loadDataBtn = document.getElementById('load-data-manual-btn');
    const rowAutoplay = document.getElementById('row-autoplay');
    const rowReverse = document.getElementById('row-reverse');

    toggleBtn.innerHTML = state.isRouteVisible ? 'ルート非表示' : 'ルート表示';

    if (state.currentMode === 'edit') {
        rowAutoplay.style.display = 'none';
        rowReverse.style.display = 'none';
    } else if (state.currentMode === 'puzzle') {
        rowAutoplay.style.display = 'none';
        rowReverse.style.display = 'flex';
        toggleBtn.style.display = 'block';
        loadDataBtn.style.display = 'block';
        reverseBtn.style.display = 'none';
    } else if (state.currentMode === 'rearrange') {
        rowAutoplay.style.display = 'flex';
        rowReverse.style.display = 'flex';
        toggleBtn.style.display = 'block';
        reverseBtn.style.display = 'block';
        loadDataBtn.style.display = 'none';
    }

    if (state.currentMode === 'rearrange') {
        newBoardBtn.innerHTML = 'ルートリセット';
        resetBtn.innerHTML = '盤面リセット';
    } else {
        const isDefault = state.activeSpawnColors.length === 6 && BASE_COLORS.every(c => state.activeSpawnColors.includes(c));
        newBoardBtn.innerHTML = isDefault ? '新しい盤面' : 'カスタム盤面';
        resetBtn.innerHTML = 'リセット';
    }

    if (state.dragRoute.length > 1) {
        toggleBtn.classList.add('has-route');
        reverseBtn.classList.add('has-route');
        autoplayBtn.classList.add('has-route');
        if (!state.isRouteVisible) {
            toggleBtn.classList.add('hidden-route');
        } else {
            toggleBtn.classList.remove('hidden-route');
        }
    } else {
        toggleBtn.classList.remove('has-route');
        toggleBtn.classList.remove('hidden-route');
        reverseBtn.classList.remove('has-route');
        autoplayBtn.classList.remove('has-route');
    }

    if (loadDataBtn) {
        let hasData = false;
        const raw = localStorage.getItem('padBoardEditorData');
        if (raw) {
            try {
                const data = JSON.parse(raw);
                if (data.boardColors && data.boardColors.length > 0) {
                    hasData = true;
                }
            } catch (e) {
                console.error(e);
            }
        }

        if (hasData) {
            loadDataBtn.classList.add('has-data');
        } else {
            loadDataBtn.classList.remove('has-data');
        }
    }
}

export function initUI() {
    // ----------------------------------------------------
    // スポーン設定（チェックボックス）の生成
    // ----------------------------------------------------
    const spawnSettingsEl = document.getElementById('spawn-settings');
    SPAWNABLE_COLORS.forEach(color => {
        let label = document.createElement('label');
        label.className = 'spawn-item';

        let cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = color;
        cb.autocomplete = 'off';
        if (BASE_COLORS.includes(color)) cb.checked = true;

        let icon = document.createElement('div');
        icon.className = `mini-orb ${color}`;

        label.appendChild(cb);
        label.appendChild(icon);
        spawnSettingsEl.appendChild(label);

        cb.addEventListener('change', () => {
            const cbs = document.querySelectorAll('#spawn-settings input:checked');
            if (cbs.length === 0) {
                cb.checked = true;
                return;
            }
            state.activeSpawnColors = Array.from(cbs).map(input => input.value);
            updateButtonLabels();
        });
    });

    const loadDataBtn = document.getElementById('load-data-manual-btn');

    loadDataBtn.addEventListener('click', () => {
        if (state.isResolving) return;
        import('./storage.js').then(m => m.applyLastSavedData());
    });
    // ----------------------------------------------------
    // パレットの生成
    // ----------------------------------------------------
    const paletteTop = document.getElementById('palette-top');
    const paletteBottom = document.getElementById('palette-bottom');

    ALL_COLORS.forEach((color, index) => {
        let div = document.createElement('div');
        div.className = `palette-orb ${color} ${color === state.selectedEditColor ? 'selected' : ''}`;
        div.dataset.color = color;
        if (color === 'unmatchable') div.classList.add('unmatchable');

        div.addEventListener('click', () => {
            document.querySelectorAll('.palette-orb').forEach(p => p.classList.remove('selected'));
            div.classList.add('selected');
            state.selectedEditColor = color;
        });

        if (index < 6) paletteTop.appendChild(div);
        else paletteBottom.appendChild(div);
    });

    // ----------------------------------------------------
    // モーダルと基本トグル関連
    // ----------------------------------------------------
    const settingsModal = document.getElementById('settings-modal');

    document.getElementById('settings-btn').addEventListener('click', () => {
        settingsModal.classList.add('active');
    });

    document.getElementById('close-settings-btn').addEventListener('click', () => {
        settingsModal.classList.remove('active');
    });

    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) {
            settingsModal.classList.remove('active');
        }
    });

    document.getElementById('count-toggle').addEventListener('change', (e) => {
        if (e.target.checked) {
            document.getElementById('drop-counts').classList.remove('hidden');
            updateDropCounts();
        } else {
            document.getElementById('drop-counts').classList.add('hidden');
        }
    });

    const min4Toggle = document.getElementById('min-4-toggle');
    const min5Toggle = document.getElementById('min-5-toggle');

    min4Toggle.addEventListener('change', (e) => {
        if (e.target.checked) {
            min5Toggle.checked = false;
            state.minMatchCount = 4;
        } else {
            state.minMatchCount = 3;
        }
    });

    min5Toggle.addEventListener('change', (e) => {
        if (e.target.checked) {
            min4Toggle.checked = false;
            state.minMatchCount = 5;
        } else {
            state.minMatchCount = 3;
        }
    });

    // ----------------------------------------------------
    // タブ（モード切替とサイズ切替）
    // ----------------------------------------------------
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            let newMode = e.target.dataset.mode;
            if (state.currentMode === newMode) return;

            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');

            setTimeout(() => {
                state.resolveId++;
                state.isResolving = false;

                if (newMode === 'rearrange' && state.currentMode === 'puzzle') {
                    saveCurrentBoardState();
                } else if (state.currentMode === 'edit' && (newMode === 'puzzle' || newMode === 'rearrange')) {
                    saveCurrentBoardState();
                } else if ((state.currentMode === 'puzzle' || state.currentMode === 'rearrange') && newMode === 'edit') {
                    restoreBoardState(true);
                }

                state.currentMode = newMode;
                updateButtonLabels();

                if (state.currentMode === 'puzzle' || state.currentMode === 'rearrange') {
                    document.getElementById('settings-btn').style.display = '';
                    document.getElementById('edit-controls').classList.remove('active');
                } else {
                    document.getElementById('settings-btn').style.display = 'none';
                    document.getElementById('edit-controls').classList.add('active');
                }
            }, 10);
        });
    });

    document.querySelectorAll('.size-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            document.querySelectorAll('.size-tab').forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');

            setTimeout(() => {
                state.resolveId++;
                state.isResolving = false;

                state.dragRoute = [];
                drawRoute();

                state.COLS = parseInt(e.target.dataset.cols);
                state.ROWS = parseInt(e.target.dataset.rows);
                document.documentElement.style.setProperty('--cols', state.COLS);
                document.documentElement.style.setProperty('--rows', state.ROWS);

                document.getElementById('board').querySelectorAll('.orb').forEach(recycleOrbElement);
                state.board = Array.from({ length: state.ROWS }, () => new Array(state.COLS).fill(null));
                state.savedBoardColors = Array.from({ length: state.ROWS }, () => new Array(state.COLS).fill(null));

                createBoard();
                updateButtonLabels();
            }, 10);
        });
    });

    // ----------------------------------------------------
    // スライダー
    // ----------------------------------------------------
    document.getElementById('speed-slider').addEventListener('input', (e) => {
        let val = parseFloat(e.target.value).toFixed(1);
        document.getElementById('speed-display').innerText = val;
        document.documentElement.style.setProperty('--fall-speed', val + 's');
    });
    document.getElementById('combo-speed-slider').addEventListener('input', (e) => {
        let val = parseFloat(e.target.value).toFixed(2);
        document.getElementById('combo-speed-display').innerText = val;
    });
    document.getElementById('swap-speed-slider').addEventListener('input', (e) => {
        let val = parseFloat(e.target.value).toFixed(2);
        document.getElementById('swap-speed-display').innerText = val;
        document.documentElement.style.setProperty('--swap-speed', val + 's');
    });
    document.getElementById('autoplay-speed-slider').addEventListener('input', (e) => {
        let val = parseFloat(e.target.value).toFixed(2);
        document.getElementById('autoplay-speed-display').innerText = val;
    });
    document.getElementById('route-width-slider').addEventListener('input', (e) => {
        let val = parseFloat(e.target.value).toFixed(2);
        document.getElementById('route-width-display').innerText = val;
        state.routeWidthBase = parseFloat(val);
        drawRoute();
    });

    // ----------------------------------------------------
    // 盤面操作ボタン群
    // ----------------------------------------------------
    document.getElementById('toggle-route-btn').addEventListener('click', () => {
        state.isRouteVisible = !state.isRouteVisible;
        setRouteLayerVisibility();
        updateButtonLabels();
    });

    document.getElementById('mirror-btn').addEventListener('click', () => {
        if (state.isResolving) return;

        setTimeout(() => {
            state.savedBoardColors = mirrorBoardColors(state.savedBoardColors);
            state.dragRoute = mirrorRoute(state.dragRoute);

            if (state.originalBoardColors) {
                state.originalBoardColors = mirrorBoardColors(state.originalBoardColors);
            }

            restoreBoardState(true);
            drawRoute();
            updateButtonLabels();
        }, 10);
    });

    document.getElementById('reverse-route-btn').addEventListener('click', () => {
        if (state.dragRoute.length <= 1 || state.isResolving) return;

        setTimeout(() => {
            state.isReversedState = !state.isReversedState;

            if (state.isReversedState) {
                state.originalBoardColors = Array.from({ length: state.ROWS }, (_, r) => [...state.savedBoardColors[r]]);
                let postBoard = computeBoardAfterRoute(state.savedBoardColors, state.dragRoute);
                state.dragRoute.reverse();

                for (let r = 0; r < state.ROWS; r++) {
                    for (let c = 0; c < state.COLS; c++) {
                        state.savedBoardColors[r][c] = postBoard[r][c];
                    }
                }
            } else {
                state.dragRoute.reverse();
                if (state.originalBoardColors) {
                    for (let r = 0; r < state.ROWS; r++) {
                        for (let c = 0; c < state.COLS; c++) {
                            state.savedBoardColors[r][c] = state.originalBoardColors[r][c];
                        }
                    }
                }
            }

            restoreBoardState(true);
            drawRoute();
        }, 10);
    });

    document.getElementById('autoplay-btn').addEventListener('click', () => {
        if (state.dragRoute.length <= 1 || state.isResolving) return;

        state.resolveId++;
        state.isResolving = true;

        restoreBoardState(true);
        startAutoplay();
    });

    document.getElementById('new-board-btn').addEventListener('click', () => {
        if (state.isResolving) return;

        setTimeout(() => {
            if (state.currentMode === 'rearrange') {
                state.isReversedState = false;
                state.originalBoardColors = null;
                state.dragRoute = [];
                drawRoute();
                updateButtonLabels();
            } else {
                state.resolveId++;
                state.isResolving = false;
                state.isReversedState = false;
                state.originalBoardColors = null;
                state.dragRoute = [];
                drawRoute();
                createBoard();
                updateButtonLabels();
            }
        }, 10);
    });

    document.getElementById('reset-btn').addEventListener('click', () => {
        setTimeout(() => {
            state.resolveId++;
            state.isResolving = false;
            restoreBoardState(true);
        }, 10);
    });

    // ----------------------------------------------------
    // スクロールトップ関連
    // ----------------------------------------------------
    document.getElementById('main-wrapper').addEventListener('scroll', (e) => {
        const btn = document.getElementById('back-to-top');
        if (e.target.scrollTop > 300) {
            btn.classList.add('show');
        } else {
            btn.classList.remove('show');
        }
    });

    document.getElementById('back-to-top').addEventListener('click', () => {
        document.getElementById('main-wrapper').scrollTo({ top: 0, behavior: 'smooth' });
    });

    // ----------------------------------------------------
    // 設定のリセット機能
    // ----------------------------------------------------
    document.getElementById('reset-settings-btn').addEventListener('click', () => {
        document.getElementById('reset-confirm-modal').classList.add('active');
    });

    document.getElementById('reset-no-btn').addEventListener('click', () => {
        document.getElementById('reset-confirm-modal').classList.remove('active');
    });

    document.getElementById('reset-yes-btn').addEventListener('click', () => {
        document.getElementById('reset-confirm-modal').classList.remove('active');

        state.activeSpawnColors = [...BASE_COLORS];
        state.minMatchCount = 3;

        document.querySelectorAll('#spawn-settings input').forEach(cb => {
            cb.checked = state.activeSpawnColors.includes(cb.value);
        });

        document.getElementById('min-4-toggle').checked = false;
        document.getElementById('min-5-toggle').checked = false;

        document.getElementById('ochicon-toggle').checked = false;
        document.getElementById('count-toggle').checked = true;
        document.getElementById('drop-counts').classList.remove('hidden');

        const setSlider = (id, val, displayVal) => {
            document.getElementById(id + '-slider').value = val;
            document.getElementById(id + '-display').innerText = displayVal;
        };

        setSlider('combo-speed', 0.2, '0.20');
        setSlider('speed', 0.1, '0.1');
        document.documentElement.style.setProperty('--fall-speed', '0.1s');

        setSlider('swap-speed', 0.15, '0.15');
        document.documentElement.style.setProperty('--swap-speed', '0.15s');

        setSlider('autoplay-speed', 0.15, '0.15');

        setSlider('route-width', 0.04, '0.04');
        state.routeWidthBase = 0.04;

        drawRoute();
        updateButtonLabels();
        updateDropCounts();

        saveToStorage();
    });
}