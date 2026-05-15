/* ═══════════════════════════════════════════════════════════════
   TCON FAE 工具箱 — 共用 JS（common.js）
   依賴：common/i18n.js（必須先於本檔載入）
   ═══════════════════════════════════════════════════════════════ */

// ─── 語言狀態 ───────────────────────────────────────────────────────────
var currentLang = 'zh-TW';

// ─── 翻譯函式 ───────────────────────────────────────────────────────────
function t(key, vars) {
  var entry = I18N[key];
  var s = (entry && entry[currentLang]) || (entry && entry['zh-TW']) || key;
  if (vars) {
    for (var k in vars) s = s.split('{' + k + '}').join(vars[k]);
  }
  return s;
}

// ─── HTML 安全過濾 ──────────────────────────────────────────────────────
function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── 節流函式 ───────────────────────────────────────────────────────────
function debounce(fn, ms) {
  var timer;
  return function() {
    clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };
}

// ─── 語言切換套用（多頁版本） ───────────────────────────────────────────
// 各工具頁面可在載入後覆寫 window._onLangChange(lang) 以執行工具專屬的重渲染
function applyLang(lang) {
  if (['zh-TW', 'en', 'zh-CN'].indexOf(lang) === -1) lang = 'zh-TW';
  currentLang = lang;
  document.documentElement.lang = lang;
  try { localStorage.setItem('tcon-lang', lang); } catch (e) {}
  try { sessionStorage.setItem('tcon-lang', lang); } catch (e) {}
  var _ls = document.getElementById('lang-select');
  if (_ls) _ls.value = lang;

  // data-i18n: textContent
  document.querySelectorAll('[data-i18n]').forEach(function(el) {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  // data-i18n-html: innerHTML
  document.querySelectorAll('[data-i18n-html]').forEach(function(el) {
    el.innerHTML = t(el.getAttribute('data-i18n-html'));
  });
  // data-i18n-ph: placeholder
  document.querySelectorAll('[data-i18n-ph]').forEach(function(el) {
    el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph')));
  });
  // data-i18n-aria: aria-label + title
  document.querySelectorAll('[data-i18n-aria]').forEach(function(el) {
    var key = el.getAttribute('data-i18n-aria');
    el.setAttribute('aria-label', t(key));
    if (el.hasAttribute('title')) el.setAttribute('title', t(key));
  });
  // data-i18n-title: title
  document.querySelectorAll('[data-i18n-title]').forEach(function(el) {
    el.setAttribute('title', t(el.getAttribute('data-i18n-title')));
  });

  // 更新 PTR 指示器
  var ptrInd  = document.getElementById('ptr-indicator');
  var ptrText = ptrInd ? ptrInd.querySelector('.ptr-text') : null;
  if (ptrText && ptrInd && !ptrInd.classList.contains('refreshing')) {
    ptrText.textContent = ptrInd.classList.contains('ready') ? t('ptr.release') : t('ptr.pull');
  }

  // 呼叫各頁面自定義的語言切換回呼（若有）
  if (typeof window._onLangChange === 'function') {
    try { window._onLangChange(lang); } catch (e) {}
  }
}

// ─── Share 功能 ─────────────────────────────────────────────────────────
function shareApp() {
  var shareUrl = 'https://brucecheng0428.github.io/tcon-tools/';
  var shareData = {
    title: t('share.shareTitle'),
    text: t('share.shareText') + '\n' + shareUrl
  };
  if (navigator.share) {
    navigator.share(shareData).catch(function() {});
  } else {
    navigator.clipboard.writeText(shareUrl).then(function() {
      alert(t('alert.urlCopied'));
    }).catch(function() {
      prompt(t('alert.promptCopy'), shareUrl);
    });
  }
}

// ─── Pull-to-Refresh（所有頁面通用） ────────────────────────────────────
(function() {
  var THRESHOLD = 70;
  var MAX_PULL = 120;
  var indicator = document.getElementById('ptr-indicator');
  if (!indicator) return; // 若頁面無 PTR indicator，跳過
  var textEl = indicator.querySelector('.ptr-text');
  var startY = 0, pulling = false, currentPull = 0, ready = false;

  function scrollTopPx() {
    return window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
  }
  function setHeight(h) {
    indicator.style.height = h + 'px';
  }
  function reset(animate) {
    if (animate) indicator.classList.add('snap-back');
    setHeight(0);
    setTimeout(function() { indicator.classList.remove('snap-back', 'ready', 'refreshing'); }, 300);
    textEl.textContent = t('ptr.pull');
    pulling = false;
    ready = false;
    currentPull = 0;
  }

  document.addEventListener('touchstart', function(e) {
    var lb = document.querySelector('.osc-lightbox.active');
    if (lb) return;
    if (e.target && e.target.closest && e.target.closest('.wfg-la-drag-handle')) { pulling = false; return; }
    if (scrollTopPx() > 0) { pulling = false; return; }
    if (e.touches.length !== 1) { pulling = false; return; }
    startY = e.touches[0].clientY;
    pulling = true;
  }, { passive: true });

  document.addEventListener('touchmove', function(e) {
    if (!pulling) return;
    if (typeof wfgLaChannelDrag !== 'undefined' && wfgLaChannelDrag) { pulling = false; return; }
    var lb = document.querySelector('.osc-lightbox.active');
    if (lb) { pulling = false; return; }
    var dy = e.touches[0].clientY - startY;
    if (dy <= 0) {
      if (currentPull > 0) setHeight(0);
      currentPull = 0;
      indicator.classList.remove('ready');
      ready = false;
      return;
    }
    if (scrollTopPx() > 0) { reset(false); return; }
    var pull = Math.min(MAX_PULL, dy * 0.5);
    currentPull = pull;
    setHeight(pull);
    if (pull >= THRESHOLD && !ready) {
      ready = true;
      indicator.classList.add('ready');
      textEl.textContent = t('ptr.release');
    } else if (pull < THRESHOLD && ready) {
      ready = false;
      indicator.classList.remove('ready');
      textEl.textContent = t('ptr.pull');
    }
    if (e.cancelable) e.preventDefault();
  }, { passive: false });

  document.addEventListener('touchend', function() {
    if (!pulling) return;
    if (ready) {
      indicator.classList.add('refreshing');
      indicator.classList.remove('ready');
      textEl.textContent = t('ptr.refreshing');
      setHeight(THRESHOLD);
      setTimeout(function() { location.reload(); }, 250);
    } else {
      reset(true);
    }
  }, { passive: true });

  document.addEventListener('touchcancel', function() {
    if (pulling) reset(true);
  }, { passive: true });
})();

// ─── 語言選擇初始化 ────────────────────────────────────────────────────
(function() {
  var savedLang = 'zh-TW';
  try { savedLang = localStorage.getItem('tcon-lang') || sessionStorage.getItem('tcon-lang') || 'zh-TW'; } catch (e) {}
  if (['zh-TW', 'en', 'zh-CN'].indexOf(savedLang) === -1) savedLang = 'zh-TW';
  var langSel = document.getElementById('lang-select');
  if (langSel) {
    langSel.value = savedLang;
    langSel.addEventListener('change', function() { applyLang(langSel.value); });
  }
  applyLang(savedLang);
})();

// ─── 簡易 Session Persistence（多頁版本） ───────────────────────────────
// 各工具頁面可自行實作更完整的 save/restore，這裡提供基礎框架
var SessionPersistence = (function() {
  var SS_KEY = 'tcon_form';

  function saveFormState() {
    try {
      var state = {};
      // radios
      document.querySelectorAll('input[type="radio"]:checked').forEach(function(r) {
        if (r.name) state['r:' + r.name] = r.value;
      });
      // inputs
      document.querySelectorAll('input[type="number"][id], input[type="range"][id], input[type="text"][id], input[type="hidden"][id]').forEach(function(inp) {
        state['i:' + inp.id] = inp.value;
      });
      // checkboxes
      document.querySelectorAll('input[type="checkbox"][id]').forEach(function(cb) {
        state['c:' + cb.id] = cb.checked ? '1' : '0';
      });
      // selects
      document.querySelectorAll('select[id]').forEach(function(sel) {
        if (sel.id === 'lang-select') return; // 語言由 localStorage 管理
        state['s:' + sel.id] = sel.value;
      });
      sessionStorage.setItem(SS_KEY, JSON.stringify(state));
    } catch(e) {}
  }

  function restoreFormState() {
    try {
      var raw = sessionStorage.getItem(SS_KEY);
      if (!raw) return false;
      var state = JSON.parse(raw);
      if (!state || typeof state !== 'object') return false;
      var restored = false;

      Object.keys(state).forEach(function(key) {
        if (key.startsWith('r:')) {
          var name = key.slice(2);
          var val = state[key];
          var radio = document.querySelector('input[type="radio"][name="' + name + '"][value="' + val + '"]');
          if (radio) { radio.checked = true; restored = true; }
        } else if (key.startsWith('i:')) {
          var id = key.slice(2);
          var el = document.getElementById(id);
          if (el) { el.value = state[key]; restored = true; }
        } else if (key.startsWith('c:')) {
          var id2 = key.slice(2);
          var el2 = document.getElementById(id2);
          if (el2) { el2.checked = state[key] === '1'; restored = true; }
        } else if (key.startsWith('s:')) {
          var id3 = key.slice(2);
          var el3 = document.getElementById(id3);
          if (el3) { el3.value = state[key]; restored = true; }
        }
      });

      return restored;
    } catch(e) { return false; }
  }

  function startAutoSave() {
    document.addEventListener('input', debounce(saveFormState, 300));
    document.addEventListener('change', debounce(saveFormState, 100));
  }

  return {
    save: saveFormState,
    restore: restoreFormState,
    startAutoSave: startAutoSave
  };
})();
