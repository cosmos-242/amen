export const BASE_COLORS = ['red', 'blue', 'green', 'yellow', 'purple', 'heal'];
export const EXTRA_COLORS = ['ojama', 'poison', 'mortal', 'bom', 'unmatchable'];
export const ALL_COLORS = [...BASE_COLORS, ...EXTRA_COLORS];
export const SPAWNABLE_COLORS = ALL_COLORS.filter(c => c !== 'unmatchable');

export const state = {
    ROWS: 5,
    COLS: 6,
    board: [],
    savedBoardColors: [],
    activeSpawnColors: [...BASE_COLORS],
    unmatchableColors: new Set(),
    savedUnmatchableColors: new Set(),

    currentMode: 'puzzle',
    selectedEditColor: 'red',
    isResolving: false,
    comboCount: 0,
    resolveId: 0,
    minMatchCount: 3,

    dragRoute: [],
    routeAnimFrame: null,
    routeAnimTimeout: null,
    routeDrawToken: 0,
    isRouteVisible: true,
    routeWidthBase: 0.04,
    routeRenderMode: 'canvas',

    originalBoardColors: null,
    isReversedState: false,

    isDragging: false,
    draggedElement: null,
    currentDragCell: null,

    isPainting: false,
    paintUnmatchableTargetState: 'true',
    lastPaintCellKey: '',

    cachedBoardRect: null,
    cachedCellW: 0,
    cachedCellH: 0,

    dropCountElements: {},
    dropCountsQueued: false,
    orbPool: []

};