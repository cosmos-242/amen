import { state } from './state.js';

export function calcCurvePoints(prev, curr, next, radius) {
    let dx1 = prev.x - curr.x;
    let dy1 = prev.y - curr.y;
    let len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);

    let dx2 = next.x - curr.x;
    let dy2 = next.y - curr.y;
    let len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

    let r = Math.min(radius, len1 / 2, len2 / 2);
    if (r === 0) {
        return { start: { x: curr.x, y: curr.y }, end: { x: curr.x, y: curr.y }, c: { x: curr.x, y: curr.y } };
    }
    return {
        start: { x: curr.x + (dx1 / len1) * r, y: curr.y + (dy1 / len1) * r },
        end: { x: curr.x + (dx2 / len2) * r, y: curr.y + (dy2 / len2) * r },
        c: { x: curr.x, y: curr.y }
    };
}

export function lerpColor(hex1, hex2, t) {
    const a = hex1.replace('#', '');
    const b = hex2.replace('#', '');
    const r1 = parseInt(a.substring(0, 2), 16);
    const g1 = parseInt(a.substring(2, 4), 16);
    const b1 = parseInt(a.substring(4, 6), 16);
    const r2 = parseInt(b.substring(0, 2), 16);
    const g2 = parseInt(b.substring(2, 4), 16);
    const b2 = parseInt(b.substring(4, 6), 16);

    const r = Math.round(r1 + (r2 - r1) * t);
    const g = Math.round(g1 + (g2 - g1) * t);
    const bVal = Math.round(b1 + (b2 - b1) * t);
    return `rgb(${r}, ${g}, ${bVal})`;
}

export function getRouteGradientColor(progress) {
    const stops = [
        { t: 0.00, color: '#00e5ff' },
        { t: 0.16, color: '#3f8cff' },
        { t: 0.32, color: '#7a5cff' },
        { t: 0.48, color: '#bf4dff' },
        { t: 0.64, color: '#ff4fa8' },
        { t: 0.78, color: '#ff7a59' },
        { t: 0.90, color: '#ffb347' },
        { t: 1.00, color: '#ff0033' }
    ];

    const p = Math.max(0, Math.min(1, progress));
    for (let i = 0; i < stops.length - 1; i++) {
        const s0 = stops[i];
        const s1 = stops[i + 1];
        if (p >= s0.t && p <= s1.t) {
            const localT = (p - s0.t) / (s1.t - s0.t || 1);
            return lerpColor(s0.color, s1.color, localT);
        }
    }
    return stops[stops.length - 1].color;
}

export function setRouteLayerVisibility() {
    const canvas = document.getElementById('route-canvas');
    const svg = document.getElementById('route-svg');
    if (!canvas || !svg) return;

    if (!state.isRouteVisible) {
        canvas.style.display = 'none';
        svg.style.display = 'none';
        return;
    }
    canvas.style.display = state.routeRenderMode === 'canvas' ? 'block' : 'none';
    svg.style.display = state.routeRenderMode === 'svg' ? 'block' : 'none';
}

export function getOrthogonalRenderPoints(route, baseWidth) {
    if (route.length <= 1) return route.map(p => ({ x: p.c + 0.5, y: p.r + 0.5 }));

    let segments = [];
    let edgeCounts = {};
    let gap = baseWidth * 2.5;

    for (let i = 0; i < route.length - 1; i++) {
        let p1 = route[i];
        let p2 = route[i + 1];
        let rMin = Math.min(p1.r, p2.r), rMax = Math.max(p1.r, p2.r);
        let cMin = Math.min(p1.c, p2.c), cMax = Math.max(p1.c, p2.c);
        let edgeKey = `${rMin},${cMin}-${rMax},${cMax}`;

        let lane = edgeCounts[edgeKey] || 0;
        edgeCounts[edgeKey] = lane + 1;

        let offset = 0;
        if (lane > 0) {
            let sign = lane % 2 === 1 ? 1 : -1;
            offset = sign * Math.ceil(lane / 2) * gap;
        }

        let isH = p1.r === p2.r;
        let isV = p1.c === p2.c;

        segments.push({
            isH: isH,
            isV: isV,
            lineVal: isH ? (p1.r + 0.5 + offset) : (p1.c + 0.5 + offset),
            cellC: p2.c + 0.5,
            cellR: p2.r + 0.5
        });
    }

    let pts = [];

    let seg0 = segments[0];
    let startCell = route[0];
    pts.push({
        x: seg0.isH ? (startCell.c + 0.5) : seg0.lineVal,
        y: seg0.isV ? (startCell.r + 0.5) : seg0.lineVal
    });

    for (let i = 0; i < segments.length - 1; i++) {
        let s1 = segments[i];
        let s2 = segments[i + 1];

        if (s1.isH && s2.isV) {
            pts.push({ x: s2.lineVal, y: s1.lineVal });
        } else if (s1.isV && s2.isH) {
            pts.push({ x: s1.lineVal, y: s2.lineVal });
        } else if (s1.isH && s2.isH) {
            pts.push({ x: s1.cellC, y: s1.lineVal });
            pts.push({ x: s1.cellC, y: s2.lineVal });
        } else if (s1.isV && s2.isV) {
            pts.push({ x: s1.lineVal, y: s1.cellR });
            pts.push({ x: s2.lineVal, y: s1.cellR });
        }
    }

    let segLast = segments[segments.length - 1];
    let endCell = route[route.length - 1];
    pts.push({
        x: segLast.isH ? (endCell.c + 0.5) : segLast.lineVal,
        y: segLast.isV ? (endCell.r + 0.5) : segLast.lineVal
    });

    return pts;
}

export function drawRoute() {
    const svg = document.getElementById('route-svg');
    const canvas = document.getElementById('route-canvas');
    if (!svg || !canvas) return;
    svg.innerHTML = '';

    const ctx = canvas.getContext('2d');
    if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    if (state.routeAnimFrame) {
        cancelAnimationFrame(state.routeAnimFrame);
        state.routeAnimFrame = null;
    }
    if (state.routeAnimTimeout) {
        clearTimeout(state.routeAnimTimeout);
        state.routeAnimTimeout = null;
    }
    state.routeDrawToken++;

    setRouteLayerVisibility();
    if (state.dragRoute.length <= 1) return;

    if (state.routeRenderMode === 'svg') {
        drawRouteSvgCompat(svg);
        return;
    }
    drawRouteCanvas(canvas, svg, state.routeDrawToken);
}

export function drawRouteCanvas(canvas, svg, drawToken) {
    const boardEl = document.getElementById('board');
    const rect = boardEl.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);

    svg.setAttribute('viewBox', `0 0 ${state.COLS} ${state.ROWS}`);

    let renderPoints = getOrthogonalRenderPoints(state.dragRoute, state.routeWidthBase);

    let fullD = "";
    for (let i = 0; i < renderPoints.length; i++) {
        if (i === 0) {
            fullD += `M ${renderPoints[i].x} ${renderPoints[i].y} `;
        } else if (i === renderPoints.length - 1) {
            fullD += `L ${renderPoints[i].x} ${renderPoints[i].y} `;
        } else {
            let cp = calcCurvePoints(renderPoints[i - 1], renderPoints[i], renderPoints[i + 1], 0.2);
            fullD += `L ${cp.start.x} ${cp.start.y} Q ${cp.c.x} ${cp.c.y} ${cp.end.x} ${cp.end.y} `;
        }
    }
    let guidePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    guidePath.setAttribute('d', fullD);
    guidePath.setAttribute('fill', 'none');
    guidePath.setAttribute('stroke', 'none');
    svg.appendChild(guidePath);

    let bgWidth = state.routeWidthBase * 2;
    let fgWidth = state.routeWidthBase;
    let markerRadius = state.routeWidthBase * 3 + 0.06;
    let textFontSize = state.routeWidthBase * 3.5 + 0.06;
    let textDy = state.routeWidthBase * 1.5;
    let animRadius = Math.max(0.03, state.routeWidthBase * 1.5);

    let totalLength = guidePath.getTotalLength();
    let startP = renderPoints[0];
    let endP = renderPoints[renderPoints.length - 1];
    const routePath = new Path2D(fullD);
    const scaleX = rect.width / state.COLS;
    const scaleY = rect.height / state.ROWS;

    let stepTime = 120;
    let totalTime = (renderPoints.length - 1) * stepTime;
    let animStartTime = null;
    let waiting = false;
    const gradSampleCount = Math.max(80, Math.min(260, Math.ceil(totalLength * 30)));
    const gradSamples = [];
    for (let i = 0; i <= gradSampleCount; i++) {
        const t = i / gradSampleCount;
        gradSamples.push({
            point: guidePath.getPointAtLength(totalLength * t),
            color: getRouteGradientColor(t)
        });
    }

    const staticCanvas = document.createElement('canvas');
    staticCanvas.width = canvas.width;
    staticCanvas.height = canvas.height;
    const staticCtx = staticCanvas.getContext('2d');
    if (!staticCtx) return;
    staticCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildStaticLayer(staticCtx);

    function animate(time) {
        if (drawToken !== state.routeDrawToken) return;
        if (waiting) return;

        if (animStartTime === null) animStartTime = time;
        let elapsed = Math.max(0, time - animStartTime);

        if (elapsed >= totalTime) {
            let lastP = renderPoints[renderPoints.length - 1];
            redrawStatic();
            drawAnimCircle(lastP.x, lastP.y);
            waiting = true;
            state.routeAnimTimeout = setTimeout(() => {
                state.routeAnimTimeout = null;
                if (drawToken !== state.routeDrawToken) return;
                animStartTime = null;
                waiting = false;
                state.routeAnimFrame = requestAnimationFrame(animate);
            }, 1000);
            return;
        } else {
            let progress = Math.max(0, Math.min(1, elapsed / totalTime));
            let pt = guidePath.getPointAtLength(progress * totalLength);
            redrawStatic();
            drawAnimCircle(pt.x, pt.y);
        }
        state.routeAnimFrame = requestAnimationFrame(animate);
    }

    function redrawStatic() {
        ctx.clearRect(0, 0, rect.width, rect.height);
        ctx.drawImage(staticCanvas, 0, 0, rect.width, rect.height);
    }

    function drawAnimCircle(x, y) {
        ctx.save();
        ctx.scale(scaleX, scaleY);
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 0.02;
        ctx.beginPath();
        ctx.arc(x, y, animRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }

    function buildStaticLayer(targetCtx) {
        targetCtx.clearRect(0, 0, rect.width, rect.height);
        targetCtx.save();
        targetCtx.scale(scaleX, scaleY);
        targetCtx.lineCap = 'round';
        targetCtx.lineJoin = 'round';

        targetCtx.strokeStyle = 'rgba(0, 0, 0, 0.9)';
        targetCtx.lineWidth = bgWidth;
        targetCtx.stroke(routePath);

        targetCtx.lineWidth = fgWidth;
        for (let i = 0; i < gradSampleCount; i++) {
            const p0 = gradSamples[i].point;
            const p1 = gradSamples[i + 1].point;
            const color = gradSamples[i + 1].color;
            targetCtx.strokeStyle = color;
            targetCtx.beginPath();
            targetCtx.moveTo(p0.x, p0.y);
            targetCtx.lineTo(p1.x, p1.y);
            targetCtx.stroke();

            targetCtx.fillStyle = color;
            targetCtx.beginPath();
            targetCtx.arc(p1.x, p1.y, fgWidth * 0.52, 0, Math.PI * 2);
            targetCtx.fill();
        }

        targetCtx.lineWidth = 0.04;
        targetCtx.fillStyle = '#00e5ff';
        targetCtx.strokeStyle = '#000';
        targetCtx.beginPath();
        targetCtx.arc(startP.x, startP.y, markerRadius, 0, Math.PI * 2);
        targetCtx.fill();
        targetCtx.stroke();
        targetCtx.font = `bold ${textFontSize}px sans-serif`;
        targetCtx.textAlign = 'center';
        targetCtx.textBaseline = 'middle';
        targetCtx.fillStyle = '#000';
        targetCtx.fillText('S', startP.x, startP.y + textDy * 0.5);

        targetCtx.fillStyle = '#ff0033';
        targetCtx.strokeStyle = '#000';
        targetCtx.beginPath();
        targetCtx.arc(endP.x, endP.y, markerRadius, 0, Math.PI * 2);
        targetCtx.fill();
        targetCtx.stroke();
        targetCtx.fillStyle = '#fff';
        targetCtx.fillText('E', endP.x, endP.y + textDy * 0.5);
        targetCtx.restore();
    }

    redrawStatic();
    state.routeAnimFrame = requestAnimationFrame(animate);
}

export function drawRouteSvgCompat(svg) {
    svg.setAttribute('viewBox', `0 0 ${state.COLS} ${state.ROWS}`);
    let renderPoints = getOrthogonalRenderPoints(state.dragRoute, state.routeWidthBase);
    let d = '';
    for (let i = 0; i < renderPoints.length; i++) {
        if (i === 0) d += `M ${renderPoints[i].x} ${renderPoints[i].y} `;
        else d += `L ${renderPoints[i].x} ${renderPoints[i].y} `;
    }
    let bgWidth = state.routeWidthBase * 2;
    let fgWidth = state.routeWidthBase;
    let bg = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    bg.setAttribute('d', d);
    bg.setAttribute('fill', 'none');
    bg.setAttribute('stroke', 'rgba(0,0,0,0.9)');
    bg.setAttribute('stroke-width', bgWidth);
    bg.setAttribute('stroke-linecap', 'round');
    bg.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(bg);
    let fg = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    fg.setAttribute('d', d);
    fg.setAttribute('fill', 'none');
    fg.setAttribute('stroke', '#ffffff');
    fg.setAttribute('stroke-width', fgWidth);
    fg.setAttribute('stroke-linecap', 'round');
    fg.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(fg);
}

export function computeBoardAfterRoute(startColors, route) {
    let result = startColors.map(row => [...row]);
    if (route.length <= 1) return result;

    let currPos = route[0];
    let draggedColor = result[currPos.r][currPos.c];

    for (let i = 1; i < route.length; i++) {
        let nextPos = route[i];
        result[currPos.r][currPos.c] = result[nextPos.r][nextPos.c];
        currPos = nextPos;
    }
    result[currPos.r][currPos.c] = draggedColor;
    return result;
}

export function mirrorRoute(route) {
    return route.map(p => ({ r: p.r, c: state.COLS - 1 - p.c }));
}