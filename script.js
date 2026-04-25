let ROWS = 5;
let COLS = 6;

const BASE_COLORS = ['red', 'blue', 'green', 'yellow', 'purple', 'heal'];
const EXTRA_COLORS = ['ojama', 'poison', 'mortal', 'bom', 'unmatchable'];
const ALL_COLORS = [...BASE_COLORS, ...EXTRA_COLORS];

let board = [];
let savedBoardColors = [];

let activeSpawnColors = [...BASE_COLORS];

let unmatchableColors = new Set();
let savedUnmatchableColors = new Set();

let currentMode = 'puzzle';
let selectedEditColor = 'red';
let isResolving = false;
let comboCount = 0;

let resolveId = 0;
let minMatchCount = 3;

let dragRoute = [];
let routeAnimFrame = null;
let routeAnimTimeout = null;
let routeDrawToken = 0;
let isRouteVisible = true;
let routeWidthBase = 0.04;
let routeRenderMode = 'canvas';

let originalBoardColors = null;
let isReversedState = false;

let isDragging = false;
let draggedElement = null;
let currentDragCell = null;
let isPainting = false;
let paintUnmatchableTargetState = 'true';
let lastPaintCellKey = '';
let cachedBoardRect = null;
let cachedCellW = 0;
let cachedCellH = 0;
const dropCountElements = {};
let dropCountsQueued = false;
const orbPool = [];

function updateButtonLabels() {
    const newBoardBtn = document.getElementById('new-board-btn');
    const resetBtn = document.getElementById('reset-btn');
    const toggleBtn = document.getElementById('toggle-route-btn');
    const reverseBtn = document.getElementById('reverse-route-btn');
    const autoplayBtn = document.getElementById('autoplay-btn');

    const rowAutoplay = document.getElementById('row-autoplay');
    const rowReverse = document.getElementById('row-reverse');

    toggleBtn.innerHTML = isRouteVisible ? 'ルート非表示' : 'ルート表示';

    if (currentMode === 'edit') {
        rowAutoplay.style.display = 'none';
        rowReverse.style.display = 'none';
    } else if (currentMode === 'puzzle') {
        rowAutoplay.style.display = 'none';
        rowReverse.style.display = 'flex';
        toggleBtn.style.display = 'block';
        reverseBtn.style.display = 'none';
    } else if (currentMode === 'rearrange') {
        rowAutoplay.style.display = 'flex';
        rowReverse.style.display = 'flex';
        toggleBtn.style.display = 'block';
        reverseBtn.style.display = 'block';
    }

    if (currentMode === 'rearrange') {
        newBoardBtn.innerHTML = 'ルートリセット';
        resetBtn.innerHTML = '盤面リセット';
    } else {
        const isDefault = activeSpawnColors.length === 6 && BASE_COLORS.every(c => activeSpawnColors.includes(c));
        newBoardBtn.innerHTML = isDefault ? '新しい盤面' : 'カスタム盤面';
        resetBtn.innerHTML = 'リセット';
    }

    if (dragRoute.length > 1) {
        toggleBtn.classList.add('has-route');
        reverseBtn.classList.add('has-route');
        autoplayBtn.classList.add('has-route');
        if (!isRouteVisible) toggleBtn.classList.add('hidden-route');
        else toggleBtn.classList.remove('hidden-route');
    } else {
        toggleBtn.classList.remove('has-route');
        toggleBtn.classList.remove('hidden-route');
        reverseBtn.classList.remove('has-route');
        autoplayBtn.classList.remove('has-route');
    }
}

const spawnSettingsEl = document.getElementById('spawn-settings');
const SPAWNABLE_COLORS = ALL_COLORS.filter(c => c !== 'unmatchable');

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
        if (cbs.length === 0) { cb.checked = true; return; }
        activeSpawnColors = Array.from(cbs).map(input => input.value);
        updateButtonLabels();
    });
});

const settingsModal = document.getElementById('settings-modal');

document.getElementById('settings-btn').addEventListener('click', () => { settingsModal.classList.add('active'); });
document.getElementById('close-settings-btn').addEventListener('click', () => { settingsModal.classList.remove('active'); });
settingsModal.addEventListener('click', (e) => { if (e.target === settingsModal) settingsModal.classList.remove('active'); });

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
    if (e.target.checked) { min5Toggle.checked = false; minMatchCount = 4; }
    else { minMatchCount = 3; }
});

min5Toggle.addEventListener('change', (e) => {
    if (e.target.checked) { min4Toggle.checked = false; minMatchCount = 5; }
    else { minMatchCount = 3; }
});

function calcCurvePoints(prev, curr, next, radius) {
    let dx1 = prev.x - curr.x; let dy1 = prev.y - curr.y; let len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
    let dx2 = next.x - curr.x; let dy2 = next.y - curr.y; let len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
    let r = Math.min(radius, len1 / 2, len2 / 2);
    if (r === 0) return { start: { x: curr.x, y: curr.y }, end: { x: curr.x, y: curr.y }, c: { x: curr.x, y: curr.y } };
    return {
        start: { x: curr.x + (dx1 / len1) * r, y: curr.y + (dy1 / len1) * r },
        end: { x: curr.x + (dx2 / len2) * r, y: curr.y + (dy2 / len2) * r },
        c: { x: curr.x, y: curr.y }
    };
}

function lerpColor(hex1, hex2, t) {
    const a = hex1.replace('#', ''); const b = hex2.replace('#', '');
    const r = Math.round(parseInt(a.substring(0, 2), 16) + (parseInt(b.substring(0, 2), 16) - parseInt(a.substring(0, 2), 16)) * t);
    const g = Math.round(parseInt(a.substring(2, 4), 16) + (parseInt(b.substring(2, 4), 16) - parseInt(a.substring(2, 4), 16)) * t);
    const bVal = Math.round(parseInt(a.substring(4, 6), 16) + (parseInt(b.substring(4, 6), 16) - parseInt(a.substring(4, 6), 16)) * t);
    return `rgb(${r}, ${g}, ${bVal})`;
}

function getRouteGradientColor(progress) {
    const stops = [
        { t: 0.00, color: '#00e5ff' }, { t: 0.16, color: '#3f8cff' }, { t: 0.32, color: '#7a5cff' },
        { t: 0.48, color: '#bf4dff' }, { t: 0.64, color: '#ff4fa8' }, { t: 0.78, color: '#ff7a59' },
        { t: 0.90, color: '#ffb347' }, { t: 1.00, color: '#ff0033' }
    ];
    const p = Math.max(0, Math.min(1, progress));
    for (let i = 0; i < stops.length - 1; i++) {
        if (p >= stops[i].t && p <= stops[i + 1].t) {
            return lerpColor(stops[i].color, stops[i + 1].color, (p - stops[i].t) / (stops[i + 1].t - stops[i].t || 1));
        }
    }
    return stops[stops.length - 1].color;
}

function setRouteLayerVisibility() {
    const canvas = document.getElementById('route-canvas'); const svg = document.getElementById('route-svg');
    if (!canvas || !svg) return;
    if (!isRouteVisible) { canvas.style.display = 'none'; svg.style.display = 'none'; return; }
    canvas.style.display = routeRenderMode === 'canvas' ? 'block' : 'none';
    svg.style.display = routeRenderMode === 'svg' ? 'block' : 'none';
}

function getOrthogonalRenderPoints(route, baseWidth) {
    if (route.length <= 1) return route.map(p => ({ x: p.c + 0.5, y: p.r + 0.5 }));
    let segments = []; let edgeCounts = {}; let gap = baseWidth * 2.5;

    for (let i = 0; i < route.length - 1; i++) {
        let p1 = route[i], p2 = route[i + 1];
        let edgeKey = `${Math.min(p1.r, p2.r)},${Math.min(p1.c, p2.c)}-${Math.max(p1.r, p2.r)},${Math.max(p1.c, p2.c)}`;
        let lane = edgeCounts[edgeKey] || 0; edgeCounts[edgeKey] = lane + 1;
        let offset = lane > 0 ? (lane % 2 === 1 ? 1 : -1) * Math.ceil(lane / 2) * gap : 0;
        let isH = p1.r === p2.r; let isV = p1.c === p2.c;
        segments.push({ isH: isH, isV: isV, lineVal: isH ? (p1.r + 0.5 + offset) : (p1.c + 0.5 + offset), cellC: p2.c + 0.5, cellR: p2.r + 0.5 });
    }

    let pts = []; let seg0 = segments[0]; let startCell = route[0];
    pts.push({ x: seg0.isH ? (startCell.c + 0.5) : seg0.lineVal, y: seg0.isV ? (startCell.r + 0.5) : seg0.lineVal });

    for (let i = 0; i < segments.length - 1; i++) {
        let s1 = segments[i], s2 = segments[i + 1];
        if (s1.isH && s2.isV) pts.push({ x: s2.lineVal, y: s1.lineVal });
        else if (s1.isV && s2.isH) pts.push({ x: s1.lineVal, y: s2.lineVal });
        else if (s1.isH && s2.isH) { pts.push({ x: s1.cellC, y: s1.lineVal }); pts.push({ x: s1.cellC, y: s2.lineVal }); }
        else if (s1.isV && s2.isV) { pts.push({ x: s1.lineVal, y: s1.cellR }); pts.push({ x: s2.lineVal, y: s1.cellR }); }
    }

    let segLast = segments[segments.length - 1]; let endCell = route[route.length - 1];
    pts.push({ x: segLast.isH ? (endCell.c + 0.5) : segLast.lineVal, y: segLast.isV ? (endCell.r + 0.5) : segLast.lineVal });
    return pts;
}

function drawRoute() {
    const svg = document.getElementById('route-svg'); const canvas = document.getElementById('route-canvas');
    if (!svg || !canvas) return; svg.innerHTML = '';
    const ctx = canvas.getContext('2d'); if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (routeAnimFrame) { cancelAnimationFrame(routeAnimFrame); routeAnimFrame = null; }
    if (routeAnimTimeout) { clearTimeout(routeAnimTimeout); routeAnimTimeout = null; }
    routeDrawToken++; setRouteLayerVisibility();

    if (dragRoute.length <= 1) return;
    if (routeRenderMode === 'svg') { drawRouteSvgCompat(svg); return; }
    drawRouteCanvas(canvas, svg, routeDrawToken);
}

function drawRouteCanvas(canvas, svg, drawToken) {
    const boardEl = document.getElementById('board');
    const rect = boardEl.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr); canvas.height = Math.round(rect.height * dpr);

    const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, rect.width, rect.height);

    svg.setAttribute('viewBox', `0 0 ${COLS} ${ROWS}`);
    let renderPoints = getOrthogonalRenderPoints(dragRoute, routeWidthBase);
    let fullD = "";
    for (let i = 0; i < renderPoints.length; i++) {
        if (i === 0) fullD += `M ${renderPoints[i].x} ${renderPoints[i].y} `;
        else if (i === renderPoints.length - 1) fullD += `L ${renderPoints[i].x} ${renderPoints[i].y} `;
        else { let cp = calcCurvePoints(renderPoints[i - 1], renderPoints[i], renderPoints[i + 1], 0.2); fullD += `L ${cp.start.x} ${cp.start.y} Q ${cp.c.x} ${cp.c.y} ${cp.end.x} ${cp.end.y} `; }
    }
    let guidePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    guidePath.setAttribute('d', fullD); svg.appendChild(guidePath);

    let bgWidth = routeWidthBase * 2; let fgWidth = routeWidthBase;
    let markerRadius = routeWidthBase * 3 + 0.06; let textFontSize = routeWidthBase * 3.5 + 0.06;
    let textDy = routeWidthBase * 1.5; let animRadius = Math.max(0.03, routeWidthBase * 1.5);
    let totalLength = guidePath.getTotalLength(); let startP = renderPoints[0]; let endP = renderPoints[renderPoints.length - 1]; const routePath = new Path2D(fullD);
    const scaleX = rect.width / COLS; const scaleY = rect.height / ROWS;

    let stepTime = 120; let totalTime = (renderPoints.length - 1) * stepTime; let animStartTime = null; let waiting = false;
    const gradSampleCount = Math.max(80, Math.min(260, Math.ceil(totalLength * 30))); const gradSamples = [];
    for (let i = 0; i <= gradSampleCount; i++) { const t = i / gradSampleCount; gradSamples.push({ point: guidePath.getPointAtLength(totalLength * t), color: getRouteGradientColor(t) }); }

    const staticCanvas = document.createElement('canvas'); staticCanvas.width = canvas.width; staticCanvas.height = canvas.height;
    const staticCtx = staticCanvas.getContext('2d'); if (!staticCtx) return; staticCtx.setTransform(dpr, 0, 0, dpr, 0, 0); buildStaticLayer(staticCtx);

    function animate(time) {
        if (drawToken !== routeDrawToken) return;
        if (waiting) return;
        if (animStartTime === null) animStartTime = time;
        let elapsed = Math.max(0, time - animStartTime);
        if (elapsed >= totalTime) {
            let lastP = renderPoints[renderPoints.length - 1]; redrawStatic(); drawAnimCircle(lastP.x, lastP.y); waiting = true;
            routeAnimTimeout = setTimeout(() => { routeAnimTimeout = null; if (drawToken !== routeDrawToken) return; animStartTime = null; waiting = false; routeAnimFrame = requestAnimationFrame(animate); }, 1000); return;
        } else {
            let progress = Math.max(0, Math.min(1, elapsed / totalTime)); let pt = guidePath.getPointAtLength(progress * totalLength); redrawStatic(); drawAnimCircle(pt.x, pt.y);
        }
        routeAnimFrame = requestAnimationFrame(animate);
    }

    function redrawStatic() { ctx.clearRect(0, 0, rect.width, rect.height); ctx.drawImage(staticCanvas, 0, 0, rect.width, rect.height); }

    function drawAnimCircle(x, y) { ctx.save(); ctx.scale(scaleX, scaleY); ctx.fillStyle = '#ffffff'; ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 0.02; ctx.beginPath(); ctx.arc(x, y, animRadius, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.restore(); }

    function buildStaticLayer(targetCtx) {
        targetCtx.clearRect(0, 0, rect.width, rect.height); targetCtx.save(); targetCtx.scale(scaleX, scaleY); targetCtx.lineCap = 'round'; targetCtx.lineJoin = 'round';
        targetCtx.strokeStyle = 'rgba(0, 0, 0, 0.9)'; targetCtx.lineWidth = bgWidth; targetCtx.stroke(routePath);
        targetCtx.lineWidth = fgWidth;
        for (let i = 0; i < gradSampleCount; i++) {
            const p0 = gradSamples[i].point; const p1 = gradSamples[i + 1].point; const color = gradSamples[i + 1].color;
            targetCtx.strokeStyle = color; targetCtx.beginPath(); targetCtx.moveTo(p0.x, p0.y); targetCtx.lineTo(p1.x, p1.y); targetCtx.stroke();
            targetCtx.fillStyle = color; targetCtx.beginPath(); targetCtx.arc(p1.x, p1.y, fgWidth * 0.52, 0, Math.PI * 2); targetCtx.fill();
        }
        targetCtx.lineWidth = 0.04; targetCtx.fillStyle = '#00e5ff'; targetCtx.strokeStyle = '#000';
        targetCtx.beginPath(); targetCtx.arc(startP.x, startP.y, markerRadius, 0, Math.PI * 2); targetCtx.fill(); targetCtx.stroke();
        targetCtx.font = `bold ${textFontSize}px sans-serif`; targetCtx.textAlign = 'center'; targetCtx.textBaseline = 'middle'; targetCtx.fillStyle = '#000'; targetCtx.fillText('S', startP.x, startP.y + textDy * 0.5);
        targetCtx.fillStyle = '#ff0033'; targetCtx.strokeStyle = '#000';
        targetCtx.beginPath(); targetCtx.arc(endP.x, endP.y, markerRadius, 0, Math.PI * 2); targetCtx.fill(); targetCtx.stroke();
        targetCtx.fillStyle = '#fff'; targetCtx.fillText('E', endP.x, endP.y + textDy * 0.5); targetCtx.restore();
    }
    redrawStatic(); routeAnimFrame = requestAnimationFrame(animate);
}

function drawRouteSvgCompat(svg) {
    svg.setAttribute('viewBox', `0 0 ${COLS} ${ROWS}`);
    let renderPoints = getOrthogonalRenderPoints(dragRoute, routeWidthBase); let d = '';
    for (let i = 0; i < renderPoints.length; i++) { if (i === 0) d += `M ${renderPoints[i].x} ${renderPoints[i].y} `; else d += `L ${renderPoints[i].x} ${renderPoints[i].y} `; }
    let bgWidth = routeWidthBase * 2; let fgWidth = routeWidthBase;
    let bg = document.createElementNS('http://www.w3.org/2000/svg', 'path'); bg.setAttribute('d', d); bg.setAttribute('fill', 'none'); bg.setAttribute('stroke', 'rgba(0,0,0,0.9)'); bg.setAttribute('stroke-width', bgWidth); bg.setAttribute('stroke-linecap', 'round'); bg.setAttribute('stroke-linejoin', 'round'); svg.appendChild(bg);
    let fg = document.createElementNS('http://www.w3.org/2000/svg', 'path'); fg.setAttribute('d', d); fg.setAttribute('fill', 'none'); fg.setAttribute('stroke', '#ffffff'); fg.setAttribute('stroke-width', fgWidth); fg.setAttribute('stroke-linecap', 'round'); fg.setAttribute('stroke-linejoin', 'round'); svg.appendChild(fg);
}

function initDropCountDisplay() {
    const container = document.getElementById('drop-counts'); container.innerHTML = ''; const fragment = document.createDocumentFragment();
    ALL_COLORS.forEach(color => {
        if (color === 'unmatchable') return;
        const item = document.createElement('div'); item.className = 'count-item'; item.style.display = 'none';
        const icon = document.createElement('div'); icon.className = `mini-orb ${color}`;
        const text = document.createElement('span'); text.innerText = '×0';
        item.appendChild(icon); item.appendChild(text); fragment.appendChild(item);
        dropCountElements[color] = { item, text };
    });
    container.appendChild(fragment);
}

function updateDropCounts() {
    if (dropCountsQueued) return; dropCountsQueued = true;
    requestAnimationFrame(() => { dropCountsQueued = false; updateDropCountsNow(); });
}

function updateDropCountsNow() {
    if (!document.getElementById('count-toggle').checked) return;
    const counts = {}; Object.keys(dropCountElements).forEach(color => counts[color] = 0);
    for (let r = 0; r < ROWS; r++) { for (let c = 0; c < COLS; c++) { if (board[r][c]) { let color = board[r][c].dataset.color; if (counts[color] !== undefined) counts[color]++; } } }
    Object.keys(dropCountElements).forEach(color => {
        const entry = dropCountElements[color]; const count = counts[color] || 0;
        entry.text.innerText = `×${count}`; entry.item.style.display = count > 0 ? 'flex' : 'none';
    });
}

document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
        let newMode = e.target.dataset.mode; if (currentMode === newMode) return;
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active')); e.target.classList.add('active');
        setTimeout(() => {
            resolveId++; isResolving = false;
            if (newMode === 'rearrange' && currentMode === 'puzzle') { saveCurrentBoardState(); }
            else if (currentMode === 'edit' && (newMode === 'puzzle' || newMode === 'rearrange')) { saveCurrentBoardState(); }
            else if ((currentMode === 'puzzle' || currentMode === 'rearrange') && newMode === 'edit') { restoreBoardState(true); }
            currentMode = newMode; updateButtonLabels();
            if (currentMode === 'puzzle' || currentMode === 'rearrange') { document.getElementById('settings-btn').style.display = ''; document.getElementById('edit-controls').classList.remove('active'); }
            else { document.getElementById('settings-btn').style.display = 'none'; document.getElementById('edit-controls').classList.add('active'); }
        }, 10);
    });
});

document.querySelectorAll('.size-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
        document.querySelectorAll('.size-tab').forEach(t => t.classList.remove('active')); e.target.classList.add('active');
        setTimeout(() => {
            resolveId++; isResolving = false; dragRoute = []; drawRoute();
            COLS = parseInt(e.target.dataset.cols); ROWS = parseInt(e.target.dataset.rows);
            document.documentElement.style.setProperty('--cols', COLS); document.documentElement.style.setProperty('--rows', ROWS);
            document.getElementById('board').querySelectorAll('.orb').forEach(recycleOrbElement);
            board = Array.from({ length: ROWS }, () => new Array(COLS).fill(null)); savedBoardColors = Array.from({ length: ROWS }, () => new Array(COLS).fill(null));
            createBoard(); updateButtonLabels();
        }, 10);
    });
});

function saveCurrentBoardState() {
    for (let r = 0; r < ROWS; r++) { for (let c = 0; c < COLS; c++) { savedBoardColors[r][c] = board[r][c] ? board[r][c].dataset.color : null; } }
    savedUnmatchableColors = new Set(unmatchableColors);
}

const paletteTop = document.getElementById('palette-top'); const paletteBottom = document.getElementById('palette-bottom');
ALL_COLORS.forEach((color, index) => {
    let div = document.createElement('div'); div.className = `palette-orb ${color} ${color === selectedEditColor ? 'selected' : ''}`; div.dataset.color = color;
    if (color === 'unmatchable') div.classList.add('unmatchable');
    div.addEventListener('click', () => { document.querySelectorAll('.palette-orb').forEach(p => p.classList.remove('selected')); div.classList.add('selected'); selectedEditColor = color; });
    if (index < 6) paletteTop.appendChild(div); else paletteBottom.appendChild(div);
});

document.getElementById('speed-slider').addEventListener('input', (e) => { let val = parseFloat(e.target.value).toFixed(1); document.getElementById('speed-display').innerText = val; document.documentElement.style.setProperty('--fall-speed', val + 's'); });
document.getElementById('combo-speed-slider').addEventListener('input', (e) => { document.getElementById('combo-speed-display').innerText = parseFloat(e.target.value).toFixed(2); });
document.getElementById('swap-speed-slider').addEventListener('input', (e) => { let val = parseFloat(e.target.value).toFixed(2); document.getElementById('swap-speed-display').innerText = val; document.documentElement.style.setProperty('--swap-speed', val + 's'); });
document.getElementById('autoplay-speed-slider').addEventListener('input', (e) => { document.getElementById('autoplay-speed-display').innerText = parseFloat(e.target.value).toFixed(2); });
document.getElementById('route-width-slider').addEventListener('input', (e) => { let val = parseFloat(e.target.value).toFixed(2); document.getElementById('route-width-display').innerText = val; routeWidthBase = parseFloat(val); drawRoute(); });
document.getElementById('toggle-route-btn').addEventListener('click', () => { isRouteVisible = !isRouteVisible; setRouteLayerVisibility(); updateButtonLabels(); });

function computeBoardAfterRoute(startColors, route) {
    let result = startColors.map(row => [...row]); if (route.length <= 1) return result;
    let currPos = route[0]; let draggedColor = result[currPos.r][currPos.c];
    for (let i = 1; i < route.length; i++) { let nextPos = route[i]; result[currPos.r][currPos.c] = result[nextPos.r][nextPos.c]; currPos = nextPos; }
    result[currPos.r][currPos.c] = draggedColor; return result;
}

function mirrorBoardColors(colors2D) { return colors2D.map(row => [...row].reverse()); }
function mirrorRoute(route) { return route.map(p => ({ r: p.r, c: COLS - 1 - p.c })); }

document.getElementById('mirror-btn').addEventListener('click', () => {
    if (isResolving) return;
    setTimeout(() => {
        savedBoardColors = mirrorBoardColors(savedBoardColors); dragRoute = mirrorRoute(dragRoute);
        if (originalBoardColors) originalBoardColors = mirrorBoardColors(originalBoardColors);
        restoreBoardState(true); drawRoute(); updateButtonLabels();
    }, 10);
});

document.getElementById('reverse-route-btn').addEventListener('click', () => {
    if (dragRoute.length <= 1 || isResolving) return;
    setTimeout(() => {
        isReversedState = !isReversedState;
        if (isReversedState) {
            originalBoardColors = Array.from({ length: ROWS }, (_, r) => [...savedBoardColors[r]]);
            let postBoard = computeBoardAfterRoute(savedBoardColors, dragRoute); dragRoute.reverse();
            for (let r = 0; r < ROWS; r++) { for (let c = 0; c < COLS; c++) { savedBoardColors[r][c] = postBoard[r][c]; } }
        } else {
            dragRoute.reverse();
            if (originalBoardColors) { for (let r = 0; r < ROWS; r++) { for (let c = 0; c < COLS; c++) { savedBoardColors[r][c] = originalBoardColors[r][c]; } } }
        }
        restoreBoardState(true); drawRoute();
    }, 10);
});

document.getElementById('autoplay-btn').addEventListener('click', () => {
    if (dragRoute.length <= 1 || isResolving) return;
    resolveId++; isResolving = true;
    if (isReversedState && originalBoardColors) { for (let r = 0; r < ROWS; r++) { for (let c = 0; c < COLS; c++) { savedBoardColors[r][c] = originalBoardColors[r][c]; } } isReversedState = false; dragRoute.reverse(); }
    restoreBoardState(true);

    let route = dragRoute; let startPos = route[0]; let movingOrb = board[startPos.r][startPos.c];
    if (!movingOrb) { isResolving = false; return; }

    movingOrb.classList.add('dragging'); movingOrb.style.transition = 'none';
    let speedMs = parseFloat(document.getElementById('autoplay-speed-slider').value) * 1000;
    let totalTime = (route.length - 1) * speedMs; let autoPlayStartTime = null; let lastIndex = 0;

    function autoPlayStep(time) {
        if (!isResolving) { movingOrb.style.transition = ''; movingOrb.classList.remove('dragging'); return; }
        if (autoPlayStartTime === null) autoPlayStartTime = time;
        let elapsed = Math.max(0, time - autoPlayStartTime);
        let progress = totalTime > 0 ? Math.min(1, elapsed / totalTime) : 1;
        let floatIndex = progress * (route.length - 1); let currentIndex = Math.floor(floatIndex);
        if (currentIndex >= route.length - 1 && progress === 1) currentIndex = route.length - 2;
        let nextIndex = currentIndex + 1; let fraction = floatIndex - currentIndex;
        let p1 = route[currentIndex]; let p2 = route[nextIndex];
        let currentR = p1.r + (p2.r - p1.r) * fraction; let currentC = p1.c + (p2.c - p1.c) * fraction;

        movingOrb.style.top = `${(currentR / ROWS) * 100}%`; movingOrb.style.left = `${(currentC / COLS) * 100}%`;

        while (lastIndex < currentIndex) {
            lastIndex++; let prevPos = route[lastIndex - 1]; let curPos = route[lastIndex];
            let targetEl = board[curPos.r][curPos.c];
            board[prevPos.r][prevPos.c] = targetEl; board[curPos.r][curPos.c] = movingOrb;
            if (targetEl) { targetEl.dataset.r = prevPos.r; targetEl.dataset.c = prevPos.c; targetEl.style.top = `${(prevPos.r / ROWS) * 100}%`; targetEl.style.left = `${(prevPos.c / COLS) * 100}%`; }
        }
        if (progress < 1) requestAnimationFrame(autoPlayStep);
        else {
            while (lastIndex < route.length - 1) {
                lastIndex++; let prevPos = route[lastIndex - 1]; let curPos = route[lastIndex];
                let targetEl = board[curPos.r][curPos.c]; board[prevPos.r][prevPos.c] = targetEl; board[curPos.r][curPos.c] = movingOrb;
                if (targetEl) { targetEl.dataset.r = prevPos.r; targetEl.dataset.c = prevPos.c; targetEl.style.top = `${(prevPos.r / ROWS) * 100}%`; targetEl.style.left = `${(prevPos.c / COLS) * 100}%`; }
            }
            movingOrb.classList.remove('dragging'); movingOrb.style.transition = '';
            movingOrb.dataset.r = route[route.length - 1].r; movingOrb.dataset.c = route[route.length - 1].c;
            resetComboText(); resolveMatches();
        }
    }
    requestAnimationFrame(autoPlayStep);
});

document.getElementById('new-board-btn').addEventListener('click', () => {
    if (isResolving) return;
    setTimeout(() => {
        if (currentMode === 'rearrange') {
            isReversedState = false; originalBoardColors = null; dragRoute = []; drawRoute(); updateButtonLabels();
        } else {
            resolveId++; isResolving = false; isReversedState = false; originalBoardColors = null; dragRoute = []; drawRoute();
            createBoard(); updateButtonLabels();
        }
    }, 10);
});

document.getElementById('reset-btn').addEventListener('click', () => {
    setTimeout(() => { resolveId++; isResolving = false; restoreBoardState(true); }, 10);
});

function createBoard() {
    const boardEl = document.getElementById('board');
    boardEl.classList.add('no-transition');

    if (!board || board.length !== ROWS || board[0]?.length !== COLS) {
        boardEl.querySelectorAll('.orb').forEach(recycleOrbElement);
        board = Array.from({ length: ROWS }, () => new Array(COLS).fill(null));
        savedBoardColors = Array.from({ length: ROWS }, () => new Array(COLS).fill(null));
    }

    unmatchableColors.clear(); savedUnmatchableColors.clear();

    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            let color; let retries = 0;
            do {
                color = activeSpawnColors[Math.floor(Math.random() * activeSpawnColors.length)]; retries++;
                if (activeSpawnColors.length < 3 || retries > 20) break;
            } while (
                (r >= 2 && board[r - 1][c]?.dataset.color === color && board[r - 2][c]?.dataset.color === color) ||
                (c >= 2 && board[r][c - 1]?.dataset.color === color && board[r][c - 2]?.dataset.color === color)
            );

            let el = board[r][c];
            if (!el) {
                el = createOrbElement(color, r, c); board[r][c] = el; boardEl.appendChild(el);
            } else {
                if (el.__recycleTimeout) { clearTimeout(el.__recycleTimeout); el.__recycleTimeout = null; }
                el.className = 'orb ' + color; el.dataset.color = color;
                el.style.transform = ''; el.style.opacity = '1';
                el.classList.remove('unmatchable'); el.dataset.unmatchable = 'false';
            }
            el.dataset.r = r; el.dataset.c = c;
            el.style.top = `${(r / ROWS) * 100}%`; el.style.left = `${(c / COLS) * 100}%`;
            savedBoardColors[r][c] = color;
        }
    }
    resetComboText(); updateDropCounts();
    requestAnimationFrame(() => { requestAnimationFrame(() => { boardEl.classList.remove('no-transition'); }); });
}

function restoreBoardState(keepCombo = false) {
    const boardEl = document.getElementById('board');
    boardEl.classList.add('no-transition');

    if (!board || board.length !== ROWS || board[0]?.length !== COLS) {
        boardEl.querySelectorAll('.orb').forEach(recycleOrbElement);
        board = Array.from({ length: ROWS }, () => new Array(COLS).fill(null));
    }

    unmatchableColors = new Set(savedUnmatchableColors);

    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            let color = (savedBoardColors[r] && savedBoardColors[r][c]) ? savedBoardColors[r][c] : null;
            let el = board[r][c];

            if (color) {
                if (!el) {
                    el = createOrbElement(color, r, c); board[r][c] = el; boardEl.appendChild(el);
                } else {
                    if (el.__recycleTimeout) { clearTimeout(el.__recycleTimeout); el.__recycleTimeout = null; }
                    el.className = 'orb ' + color; el.dataset.color = color;
                    el.style.transform = ''; el.style.opacity = '1';
                    if (unmatchableColors.has(color)) { el.classList.add('unmatchable'); el.dataset.unmatchable = 'true'; }
                    else { el.classList.remove('unmatchable'); el.dataset.unmatchable = 'false'; }
                }
                el.dataset.r = r; el.dataset.c = c;
                el.style.top = `${(r / ROWS) * 100}%`; el.style.left = `${(c / COLS) * 100}%`;
            } else if (el) {
                recycleOrbElement(el); board[r][c] = null;
            }
        }
    }
    if (!keepCombo) resetComboText();
    updateDropCounts();
    requestAnimationFrame(() => { requestAnimationFrame(() => { boardEl.classList.remove('no-transition'); }); });
}

function resetComboText() { comboCount = 0; document.getElementById('combo-text').innerText = ''; }

function recycleOrbElement(el) {
    if (!el || el.__inPool) return;
    if (el.__recycleTimeout) { clearTimeout(el.__recycleTimeout); el.__recycleTimeout = null; }
    if (el.parentNode) el.parentNode.removeChild(el);
    el.__inPool = true; el.className = 'orb'; el.style.transform = ''; el.style.opacity = ''; el.style.transition = ''; el.style.top = ''; el.style.left = ''; el.style.width = ''; el.style.height = '';
    delete el.dataset.color; delete el.dataset.r; delete el.dataset.c; delete el.dataset.unmatchable;
    orbPool.push(el);
}

function createOrbElement(color, r, c) {
    let el = orbPool.pop() || document.createElement('div'); el.__inPool = false; el.className = 'orb ' + color;
    el.dataset.color = color; el.dataset.r = r; el.dataset.c = c;
    if (unmatchableColors.has(color)) { el.classList.add('unmatchable'); el.dataset.unmatchable = 'true'; }
    else { el.dataset.unmatchable = 'false'; }
    el.style.width = `${100 / COLS}%`; el.style.height = `${100 / ROWS}%`;
    return el;
}

const boardEl = document.getElementById('board');
boardEl.addEventListener('touchstart', handleInputStart, { passive: false });
boardEl.addEventListener('mousedown', handleInputStart);
document.addEventListener('touchmove', handleInputMove, { passive: false });
document.addEventListener('mousemove', handleInputMove);
document.addEventListener('touchend', handleInputEnd);
document.addEventListener('mouseup', handleInputEnd);

function getEventPos(e) { return e.touches ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : { x: e.clientX, y: e.clientY }; }

function getGridPos(x, y, clamp = false) {
    const rect = cachedBoardRect || boardEl.getBoundingClientRect();
    const cellW = cachedCellW || rect.width / COLS; const cellH = cachedCellH || rect.height / ROWS;
    let c = Math.floor((x - rect.left) / cellW); let r = Math.floor((y - rect.top) / cellH);
    if (clamp) { c = Math.max(0, Math.min(c, COLS - 1)); r = Math.max(0, Math.min(r, ROWS - 1)); return { r, c }; }
    if (r >= 0 && r < ROWS && c >= 0 && c < COLS) return { r, c };
    return null;
}

function handleInputStart(e) {
    if (isResolving) return;
    if (!e.target.closest('#board') && !e.target.classList.contains('orb')) return;
    e.preventDefault();

    cachedBoardRect = boardEl.getBoundingClientRect(); cachedCellW = cachedBoardRect.width / COLS; cachedCellH = cachedBoardRect.height / ROWS;
    let { x, y } = getEventPos(e); let targetPos = getGridPos(x, y, false);

    if (currentMode === 'puzzle' || currentMode === 'rearrange') {
        if (!targetPos || !e.target.classList.contains('orb')) return;
        currentDragCell = targetPos; draggedElement = board[currentDragCell.r][currentDragCell.c];
        if (!draggedElement) return;
        if (currentMode === 'rearrange' && dragRoute.length > 1) { draggedElement = null; currentDragCell = null; return; }

        isDragging = true;
        if (currentMode === 'puzzle') resetComboText();

        boardEl.style.overflow = 'visible'; document.getElementById('board-area').style.zIndex = '30';

        if (currentMode === 'rearrange' && dragRoute.length <= 1) {
            dragRoute = [{ r: currentDragCell.r, c: currentDragCell.c }];
            const svg = document.getElementById('route-svg'); if (svg) svg.innerHTML = '';
            if (routeAnimFrame) { cancelAnimationFrame(routeAnimFrame); routeAnimFrame = null; }
        }
        draggedElement.classList.add('dragging'); updateDragPosition(x, y);

    } else if (currentMode === 'edit') {
        isPainting = true; lastPaintCellKey = ''; paintUnmatchableTargetState = 'true';
        if (targetPos) {
            let el = board[targetPos.r][targetPos.c];
            if (selectedEditColor === 'unmatchable' && el) paintUnmatchableTargetState = unmatchableColors.has(el.dataset.color) ? 'false' : 'true';
            paintOrb(targetPos.r, targetPos.c);
        }
    }
}

function handleInputMove(e) {
    if (isDragging || isPainting || e.target.closest('#board')) {
        if (e.cancelable) e.preventDefault();
    }
    if (isResolving || (!isDragging && !isPainting)) return;

    let { x, y } = getEventPos(e); let targetPos = getGridPos(x, y, true);

    if ((currentMode === 'puzzle' || currentMode === 'rearrange') && isDragging) {
        updateDragPosition(x, y);
        if (targetPos && (targetPos.r !== currentDragCell.r || targetPos.c !== currentDragCell.c)) {
            let targetEl = board[targetPos.r][targetPos.c];
            board[currentDragCell.r][currentDragCell.c] = targetEl; board[targetPos.r][targetPos.c] = draggedElement;
            if (targetEl) {
                targetEl.dataset.r = currentDragCell.r; targetEl.dataset.c = currentDragCell.c;
                targetEl.style.top = `${(currentDragCell.r / ROWS) * 100}%`; targetEl.style.left = `${(currentDragCell.c / COLS) * 100}%`;
            }
            currentDragCell = targetPos;

            if (currentMode === 'rearrange') {
                let lastObj = dragRoute[dragRoute.length - 1];
                if (lastObj.r !== targetPos.r || lastObj.c !== targetPos.c) {
                    if (dragRoute.length >= 2 && dragRoute[dragRoute.length - 2].r === targetPos.r && dragRoute[dragRoute.length - 2].c === targetPos.c) {
                        dragRoute.pop();
                    } else { dragRoute.push({ r: targetPos.r, c: targetPos.c }); }
                }
            }
        }
    } else if (currentMode === 'edit' && isPainting) {
        let exactTargetPos = getGridPos(x, y, false);
        if (exactTargetPos) paintOrb(exactTargetPos.r, exactTargetPos.c);
    }
}

function handleInputEnd() {
    if (currentMode === 'puzzle' || currentMode === 'rearrange') {
        if (!isDragging) return;
        isDragging = false; boardEl.style.overflow = 'hidden'; document.getElementById('board-area').style.zIndex = '10';

        draggedElement.classList.remove('dragging');
        draggedElement.dataset.r = currentDragCell.r; draggedElement.dataset.c = currentDragCell.c;
        draggedElement.style.top = `${(currentDragCell.r / ROWS) * 100}%`; draggedElement.style.left = `${(currentDragCell.c / COLS) * 100}%`;

        draggedElement = null; currentDragCell = null;

        if (currentMode === 'puzzle') resolveMatches();
        else if (currentMode === 'rearrange') { drawRoute(); updateButtonLabels(); }

    } else if (currentMode === 'edit') {
        isPainting = false; lastPaintCellKey = '';
    }
    cachedBoardRect = null; cachedCellW = 0; cachedCellH = 0;
}

function updateDragPosition(x, y) {
    const rect = cachedBoardRect || boardEl.getBoundingClientRect();
    const cellW = cachedCellW || rect.width / COLS; const cellH = cachedCellH || rect.height / ROWS;
    let leftPx = (x - rect.left) - cellW / 2; let topPx = (y - rect.top) - cellH / 2;
    draggedElement.style.left = `${(leftPx / rect.width) * 100}%`; draggedElement.style.top = `${(topPx / rect.height) * 100}%`;
}

function paintOrb(r, c) {
    const paintKey = `${r},${c},${selectedEditColor},${paintUnmatchableTargetState}`;
    if (currentMode === 'edit' && isPainting && lastPaintCellKey === paintKey) return;
    lastPaintCellKey = paintKey;

    let el = board[r][c];
    if (!el) {
        if (selectedEditColor !== 'unmatchable') {
            let newEl = createOrbElement(selectedEditColor, r, c);
            newEl.style.top = `${(r / ROWS) * 100}%`; newEl.style.left = `${(c / COLS) * 100}%`;
            board[r][c] = newEl; document.getElementById('board').appendChild(newEl);
        }
    } else {
        if (selectedEditColor === 'unmatchable') {
            let targetColor = el.dataset.color;
            if (paintUnmatchableTargetState === 'true') unmatchableColors.add(targetColor); else unmatchableColors.delete(targetColor);
            syncUnmatchableDisplay();
        } else {
            el.className = 'orb ' + selectedEditColor; el.dataset.color = selectedEditColor;
            if (unmatchableColors.has(selectedEditColor)) { el.classList.add('unmatchable'); el.dataset.unmatchable = 'true'; }
            else { el.classList.remove('unmatchable'); el.dataset.unmatchable = 'false'; }
        }
    }
    updateDropCounts();
}

function syncUnmatchableDisplay() {
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            let orb = board[r][c];
            if (orb) {
                if (unmatchableColors.has(orb.dataset.color)) { orb.classList.add('unmatchable'); orb.dataset.unmatchable = 'true'; }
                else { orb.classList.remove('unmatchable'); orb.dataset.unmatchable = 'false'; }
            }
        }
    }
}

/* --- 連鎖処理 --- */
async function resolveMatches() {
    resolveId++; const currentResolveId = resolveId; isResolving = true;
    let isOchiconEnabled = document.getElementById('ochicon-toggle').checked;
    let comboDelayMs = parseFloat(document.getElementById('combo-speed-slider').value) * 1000;

    let initialGroups = findComboGroups(); let matchedBombs = new Set();
    initialGroups.forEach(group => { let firstEl = board[group[0].r][group[0].c]; if (firstEl && firstEl.dataset.color === 'bom') group.forEach(pos => matchedBombs.add(`${pos.r},${pos.c}`)); });

    let isolatedBombs = [];
    for (let r = 0; r < ROWS; r++) { for (let c = 0; c < COLS; c++) { let el = board[r][c]; if (el && el.dataset.color === 'bom' && !matchedBombs.has(`${r},${c}`)) isolatedBombs.push({ r, c }); } }

    let bombExplodedThisTurn = false;
    if (isolatedBombs.length > 0) {
        let blastRadius = new Set();
        isolatedBombs.forEach(b => { for (let r = 0; r < ROWS; r++) blastRadius.add(`${r},${b.c}`); for (let c = 0; c < COLS; c++) blastRadius.add(`${b.r},${c}`); });
        blastRadius.forEach(coord => {
            if (matchedBombs.has(coord)) return;
            let [r, c] = coord.split(',').map(Number); let el = board[r][c];
            if (el) {
                el.classList.add('exploded'); board[r][c] = null;
                el.__recycleTimeout = setTimeout(() => { el.__recycleTimeout = null; recycleOrbElement(el); }, 250);
                bombExplodedThisTurn = true;
            }
        });
        if (bombExplodedThisTurn) { if (currentResolveId !== resolveId) return; await sleep(250); if (currentResolveId !== resolveId) return; }
    }

    let matched = true;

    while (matched) {
        if (currentResolveId !== resolveId) return;
        if (comboCount >= 64) { matched = false; break; }

        let comboGroups = findComboGroups();
        if (comboGroups.length === 0) {
            if (bombExplodedThisTurn) {
                await applyGravity(isOchiconEnabled, currentResolveId); if (currentResolveId !== resolveId) return; await sleep(100); if (currentResolveId !== resolveId) return;
                bombExplodedThisTurn = false; continue;
            }
            matched = false; break;
        }
        bombExplodedThisTurn = false;

        let curedThisTurn = false;
        for (let group of comboGroups) { if (group.length === 4) { let firstEl = board[group[0].r][group[0].c]; if (firstEl && ['red', 'blue', 'green', 'yellow', 'purple'].includes(firstEl.dataset.color)) curedThisTurn = true; } }
        if (curedThisTurn) { unmatchableColors.clear(); syncUnmatchableDisplay(); }

        comboGroups.sort((a, b) => {
            let aMaxR = Math.max(...a.map(o => o.r)); let aMinC = Math.min(...a.filter(o => o.r === aMaxR).map(o => o.c));
            let bMaxR = Math.max(...b.map(o => o.r)); let bMinC = Math.min(...b.filter(o => o.r === bMaxR).map(o => o.c));
            if (aMaxR !== bMaxR) return bMaxR - aMaxR; return aMinC - bMinC;
        });

        for (let group of comboGroups) {
            if (currentResolveId !== resolveId) return;
            comboCount++; document.getElementById('combo-text').innerText = `${comboCount} Combo!`;
            group.forEach(m => {
                let el = board[m.r][m.c];
                if (el) {
                    el.style.transform = 'scale(0)'; el.style.opacity = '0'; board[m.r][m.c] = null;
                    el.__recycleTimeout = setTimeout(() => { el.__recycleTimeout = null; recycleOrbElement(el); }, 250);
                }
            });
            await sleep(comboDelayMs);
        }
        if (currentResolveId !== resolveId) return; await sleep(100);
        if (currentResolveId !== resolveId) return; await applyGravity(isOchiconEnabled, currentResolveId);
        if (currentResolveId !== resolveId) return; await sleep(100);
    }
    if (currentResolveId === resolveId) { setTimeout(() => { if (currentResolveId === resolveId) { restoreBoardState(true); isResolving = false; } }, 1000); }
}

function findComboGroups() {
    let removeFlags = Array.from({ length: ROWS }, () => new Array(COLS).fill(false));
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c <= COLS - 3; c++) {
            let el = board[r][c]; if (!el || el.dataset.unmatchable === 'true') continue; let color = el.dataset.color; let len = 1;
            while (c + len < COLS && board[r][c + len] && board[r][c + len].dataset.color === color && board[r][c + len].dataset.unmatchable !== 'true') len++;
            if (len >= 3) { for (let i = 0; i < len; i++) removeFlags[r][c + i] = true; }
        }
    }
    for (let c = 0; c < COLS; c++) {
        for (let r = 0; r <= ROWS - 3; r++) {
            let el = board[r][c]; if (!el || el.dataset.unmatchable === 'true') continue; let color = el.dataset.color; let len = 1;
            while (r + len < ROWS && board[r + len][c] && board[r + len][c].dataset.color === color && board[r + len][c].dataset.unmatchable !== 'true') len++;
            if (len >= 3) { for (let i = 0; i < len; i++) removeFlags[r + i][c] = true; }
        }
    }
    let visited = Array.from({ length: ROWS }, () => new Array(COLS).fill(false)); let groups = [];
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (removeFlags[r][c] && !visited[r][c]) {
                let color = board[r][c].dataset.color; let group = []; let queue = [{ r, c }]; visited[r][c] = true;
                while (queue.length > 0) {
                    let curr = queue.shift(); group.push(curr); let dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
                    for (let [dr, dc] of dirs) {
                        let nr = curr.r + dr; let nc = curr.c + dc;
                        if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
                            if (removeFlags[nr][nc] && !visited[nr][nc] && board[nr][nc] && board[nr][nc].dataset.color === color) { visited[nr][nc] = true; queue.push({ r: nr, c: nc }); }
                        }
                    }
                }
                if (group.length >= minMatchCount) groups.push(group);
            }
        }
    }
    return groups;
}

async function applyGravity(spawnNew, currentResolveId) {
    let speedStr = document.documentElement.style.getPropertyValue('--fall-speed') || '0.1s';
    let fallTimeMs = parseFloat(speedStr) * 1000; let moved = false;
    const boardEl = document.getElementById('board'); const spawnFragment = document.createDocumentFragment(); let newSpawnedOrbs = [];
    let fallColors = activeSpawnColors.filter(color => color !== 'bom'); if (fallColors.length === 0) fallColors = BASE_COLORS;

    for (let c = 0; c < COLS; c++) {
        let emptyCount = 0;
        for (let r = ROWS - 1; r >= 0; r--) {
            let el = board[r][c];
            if (!el) { emptyCount++; }
            else if (emptyCount > 0) {
                board[r + emptyCount][c] = el; board[r][c] = null;
                el.dataset.r = r + emptyCount; el.classList.add('falling');
                el.style.top = `${((r + emptyCount) / ROWS) * 100}%`; moved = true;
            }
        }
        if (spawnNew) {
            for (let r = 0; r < emptyCount; r++) {
                let newColor = fallColors[Math.floor(Math.random() * fallColors.length)];
                let newEl = createOrbElement(newColor, r, c);
                newEl.style.transition = 'none'; newEl.style.top = `${((r - emptyCount) / ROWS) * 100}%`; newEl.style.left = `${(c / COLS) * 100}%`;
                board[r][c] = newEl; spawnFragment.appendChild(newEl);
                newSpawnedOrbs.push({ el: newEl, targetTop: `${(r / ROWS) * 100}%` }); moved = true;
            }
        }
    }
    boardEl.appendChild(spawnFragment);

    if (newSpawnedOrbs.length > 0) {
        boardEl.offsetHeight;
        newSpawnedOrbs.forEach(item => { item.el.style.transition = ''; item.el.classList.add('falling'); item.el.style.top = item.targetTop; });
    }
    if (moved) {
        if (currentResolveId && currentResolveId !== resolveId) return; await sleep(fallTimeMs + 50);
        if (currentResolveId && currentResolveId !== resolveId) return;
        board.forEach(row => row.forEach(el => el && el.classList.remove('falling')));
    }
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

document.getElementById('main-wrapper').addEventListener('scroll', (e) => {
    const btn = document.getElementById('back-to-top');
    if (e.target.scrollTop > 300) { btn.style.display = 'block'; }
    else { btn.style.display = 'none'; }
});

document.getElementById('back-to-top').addEventListener('click', () => {
    document.getElementById('main-wrapper').scrollTo({ top: 0, behavior: 'smooth' });
});

initDropCountDisplay(); createBoard(); updateButtonLabels();
window.addEventListener('pageshow', (event) => {
    document.getElementById('min-4-toggle').checked = (minMatchCount === 4);
    document.getElementById('min-5-toggle').checked = (minMatchCount === 5);
});