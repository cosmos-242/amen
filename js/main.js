import { state } from './state.js';
import { initUI } from './ui.js';
import { initPuzzleInput } from './puzzle.js';
import { loadFromStorage, saveToStorage } from './storage.js';

// ServiceWorkerの登録
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        // PWAとして動かすため、1階層上の sw.js を指定
        navigator.serviceWorker.register('../sw.js').catch(error => {
            console.log('ServiceWorkerの登録に失敗しました', error);
        });
    });
}

// Androidの自動インストールプロンプト（バナー）を抑制
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
});

// 初期化
window.addEventListener('DOMContentLoaded', () => {
    initUI();
    initPuzzleInput();
    loadFromStorage();
});

// 保存処理のイベント登録
window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveToStorage();
});
window.addEventListener('pagehide', () => saveToStorage());

// ページ表示時の状態補正
window.addEventListener('pageshow', () => {
    document.getElementById('min-4-toggle').checked = (state.minMatchCount === 4);
    document.getElementById('min-5-toggle').checked = (state.minMatchCount === 5);
});