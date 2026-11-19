/**
 * Sora RP Calendar — index.js
 * Мини-календарь ролевой игры над полем ввода SillyTavern.
 * Работает только локально: читает историю чата, ничего не отправляет и не изменяет.
 */
import { scanChat, parseDate, parseTime, formatDate, formatTime, detectDecor } from './parser.js';

const MODULE = 'sora_rp_calendar';
const PANEL_ID = 'sora_rp_calendar';
const SETTINGS_ID = 'sora_rp_calendar_settings';
const VERSION = '1.0.0';

const MODES = ['compact', 'standard', 'expanded'];
const MODE_LABELS = { compact: 'Компактный', standard: 'Стандартный', expanded: 'Раскрытый' };

const DEFAULTS = Object.freeze({
    enabled: true,
    mode: 'standard',
    textColor: '',
    borderColor: '',
    bgColor: '',
    bgOpacity: 55,
    flowers: true,
    adaptiveDecor: true,
    manual: {},
});

// Если расширение загружено повторно — аккуратно убираем предыдущий экземпляр.
if (window.SoraRPCalendar && typeof window.SoraRPCalendar.destroy === 'function') {
    try { window.SoraRPCalendar.destroy(); } catch { /* ignore */ }
}

/* ------------------------------------------------------------------ */
/*  Иконки (SVG, currentColor)                                          */
/* ------------------------------------------------------------------ */

const svg = (inner, cls = 'sora-ic') =>
    `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

const ICON = {
    cal: svg('<rect x="3.5" y="5" width="17" height="15.5" rx="3.5"/><path d="M8 3v4M16 3v4M3.5 10.2h17"/><circle cx="8.6" cy="14.4" r=".7" fill="currentColor"/><circle cx="12" cy="14.4" r=".7" fill="currentColor"/>'),
    clock: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
    pin: svg('<path d="M12 21s-6.5-5.6-6.5-10.5a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21z"/><circle cx="12" cy="10.5" r="2.3"/>'),
    cloud: svg('<path d="M7.5 18.5h9.2a3.8 3.8 0 0 0 .5-7.57 5.5 5.5 0 0 0-10.6 1.3A3.2 3.2 0 0 0 7.5 18.5z"/>'),
    chevron: svg('<path d="M9 6l6 6-6 6"/>', 'sora-ic sora-chev'),
    refresh: svg('<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4.5V11h-6.5"/>'),
    pencil: svg('<path d="M4 20l1-4L16.5 4.5a2 2 0 0 1 3 3L8 19l-4 1z"/>', 'sora-ic sora-ic-sm'),
    flower:
        '<svg viewBox="0 0 40 40" aria-hidden="true"><g fill="currentColor">' +
        [0, 72, 144, 216, 288]
            .map((a) => `<path d="M20 20C13.5 14.5 14 6.5 20 3c6 3.5 6.5 11.5 0 17z" transform="rotate(${a} 20 20)"/>`)
            .join('') +
        '</g><circle cx="20" cy="20" r="2.4" fill="#fff" fill-opacity=".55"/></svg>',
};


/* ------------------------------------------------------------------ */
/*  Узоры: сезон / время суток / погода                                 */
/* ------------------------------------------------------------------ */

const G = (inner) => `<svg viewBox="0 0 40 40" aria-hidden="true">${inner}</svg>`;
const rot = (angles, fn) => angles.map((a) => fn(a)).join('');
const CLOUD = (t = '') =>
    `<g fill="currentColor" transform="${t}"><circle cx="14" cy="24" r="6"/><circle cx="22" cy="19" r="8"/><circle cx="29" cy="25" r="5.5"/><rect x="14" y="24" width="15" height="6.5" rx="3.2"/></g>`;
const SUN = (t = '') =>
    `<g transform="${t}"><circle cx="20" cy="20" r="6.5" fill="currentColor"/><g stroke="currentColor" stroke-width="2.4" stroke-linecap="round">${rot(
        [0, 45, 90, 135, 180, 225, 270, 315],
        (a) => `<path d="M20 5.5v4" transform="rotate(${a} 20 20)"/>`,
    )}</g></g>`;
const MOON = (t = '') => `<path transform="${t}" d="M25 5a15 15 0 1 0 10 22A12.5 12.5 0 0 1 25 5z" fill="currentColor"/>`;

const GLYPH = {
    sakura: ICON.flower,
    daisy: G(
        `<g fill="currentColor">${rot([0, 45, 90, 135, 180, 225, 270, 315], (a) => `<ellipse cx="20" cy="9.5" rx="3.3" ry="6.5" transform="rotate(${a} 20 20)"/>`)}</g><circle cx="20" cy="20" r="4.4" fill="#fff" fill-opacity=".6"/>`,
    ),
    leaf: G(
        '<path d="M20 3c10.5 8 13 21 0 34C7 24 9.5 11 20 3z" fill="currentColor"/><path d="M20 10v27M20 20l-5-4M20 26l6-5" stroke="#fff" stroke-opacity=".5" stroke-width="1.4" stroke-linecap="round" fill="none"/>',
    ),
    snowflake: G(
        `<g stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" fill="none">${rot([0, 60, 120], (a) => `<g transform="rotate(${a} 20 20)"><path d="M20 4v32M15 9.5l5 4 5-4M15 30.5l5-4 5 4"/></g>`)}</g>`,
    ),
    sun: G(SUN()),
    moon: G(MOON()),
    cloud: G(CLOUD()),
    partlySun: G(SUN('translate(-5 -6) scale(.78 .78) translate(5 7)') + CLOUD('translate(3 5) scale(.9)')),
    partlyMoon: G(MOON('translate(-3 -4) scale(.7) translate(5 5)') + CLOUD('translate(3 5) scale(.9)')),
    rain: G(
        CLOUD('translate(0 -6)') +
            '<g stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M13 29l-2 6M20 29l-2 6M27 29l-2 6"/></g>',
    ),
    storm: G(CLOUD('translate(0 -6)') + '<path d="M21.5 23l-6 9h5l-2 7.5 8-10.5h-5.500l3-6z" fill="#fff" fill-opacity=".85"/>'),
    snow: G(
        CLOUD('translate(0 -6)') +
            '<g fill="currentColor"><circle cx="13" cy="31" r="1.9"/><circle cx="20" cy="34.5" r="1.9"/><circle cx="27" cy="31" r="1.9"/></g>',
    ),
    fog: G(
        '<g stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M8 13h20M13 20h20M8 27h18M14 34h14"/></g>',
    ),
    star: G('<path d="M20 3l3.2 13.8L37 20l-13.8 3.2L20 37l-3.2-13.8L3 20l13.8-3.2z" fill="currentColor"/>'),
};

const SEASON_GLYPH = { spring: 'sakura', summer: 'daisy', autumn: 'leaf', winter: 'snowflake' };

/** Подбирает три узора по датам/времени/погоде. Возвращает html и метки для CSS. */
function decorFor(decor, adaptive) {
    if (!adaptive) {
        return { season: 'none', dp: 'none', tone: 'none', a: GLYPH.sakura, b: GLYPH.sakura, c: GLYPH.sakura };
    }
    const season = decor.season || 'spring';
    const dp = decor.daypart || 'day';
    const night = dp === 'night';
    const wx = decor.weather;

    let tone;
    let b;
    if (wx === 'storm') [tone, b] = ['storm', GLYPH.storm];
    else if (wx === 'snow') [tone, b] = ['snow', GLYPH.snow];
    else if (wx === 'rain') [tone, b] = ['rain', GLYPH.rain];
    else if (wx === 'fog') [tone, b] = ['fog', GLYPH.fog];
    else if (wx === 'cloud') [tone, b] = ['cloud', GLYPH.cloud];
    else if (wx === 'partly') [tone, b] = night ? ['moon', GLYPH.partlyMoon] : ['sun', GLYPH.partlySun];
    else [tone, b] = night ? ['moon', GLYPH.moon] : ['sun', GLYPH.sun];

    const a = GLYPH[SEASON_GLYPH[season]];
    const c = night ? GLYPH.star : a;
    return { season, dp, tone, a, b, c, cStar: night };
}

/* ------------------------------------------------------------------ */
/*  Контекст и настройки                                                */
/* ------------------------------------------------------------------ */

const getCtx = () => SillyTavern.getContext();

function getSettings() {
    const store = getCtx().extensionSettings;
    if (!store[MODULE] || typeof store[MODULE] !== 'object') store[MODULE] = {};
    const s = store[MODULE];
    for (const k of Object.keys(DEFAULTS)) {
        if (s[k] === undefined) s[k] = typeof DEFAULTS[k] === 'object' ? {} : DEFAULTS[k];
    }
    if (!MODES.includes(s.mode)) s.mode = 'standard';
    return s;
}

const saveSettings = () => getCtx().saveSettingsDebounced();

/** Уникальный ключ чата: владелец (персонаж/группа) + id чата. */
function chatKey(ctx) {
    if (ctx.chatId === undefined || ctx.chatId === null || ctx.chatId === '') return null;
    let owner = 'n';
    if (ctx.groupId) owner = 'g:' + ctx.groupId;
    else if (ctx.characterId !== undefined && ctx.characters?.[ctx.characterId]) {
        owner = 'c:' + (ctx.characters[ctx.characterId].avatar || ctx.characterId);
    }
    return owner + '|' + ctx.chatId;
}

/* ------------------------------------------------------------------ */
/*  Состояние                                                           */
/* ------------------------------------------------------------------ */

const state = {
    key: null,
    cache: new Map(),
    result: null,
};

let active = false;
let timer = null;
let lateTimer = null;
let mountRetry = null;
let bound = [];
let panelEl = null;

/* ------------------------------------------------------------------ */
/*  Вспомогательное                                                     */
/* ------------------------------------------------------------------ */

const esc = (v) =>
    String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function schedule(ms = 120) {
    if (!active) return;
    clearTimeout(timer);
    timer = setTimeout(refresh, ms);
}

/* ------------------------------------------------------------------ */
/*  Сканирование                                                        */
/* ------------------------------------------------------------------ */

function refresh() {
    timer = null;
    if (!active) return;
    const ctx = getCtx();
    const key = chatKey(ctx);

    if (key !== state.key) {
        // другой чат — ничего из прошлого не переносим
        state.key = key;
        state.cache.clear();
        state.result = null;
    }

    state.result = key ? scanChat(ctx.chat || [], state.cache) : null;
    render();
    syncSettingsUI();
}

function forceRefresh() {
    state.cache.clear();
    refresh();
}

function onChatChanged() {
    if (!active) return;
    clearTimeout(timer);
    state.key = null;
    state.cache.clear();
    state.result = null;
    refresh();
    // страховка: чат может дорисоваться чуть позже
    clearTimeout(lateTimer);
    lateTimer = setTimeout(() => schedule(0), 500);
}

/* ------------------------------------------------------------------ */
/*  Модель отображения                                                  */
/* ------------------------------------------------------------------ */

function compose(s) {
    const auto = state.result;
    let date = auto?.date || null;
    let time = auto?.time || null;
    let place = auto?.place || '';
    const weather = auto?.weather || '';
    let raw = auto?.raw || '';

    const man = state.key ? s.manual[state.key] : null;
    let manual = false;
    if (man && man.enabled) {
        const md = man.date ? parseDate(man.date) : null;
        const mt = man.time ? parseTime(man.time) : null;
        if (md) date = md;
        if (mt) time = mt;
        if (man.place && man.place.trim()) place = man.place.trim();
        manual = !!(md || mt || (man.place && man.place.trim()));
        if (manual) raw = raw ? 'Ручные значения поверх: ' + raw : 'Ручные значения';
    }

    return {
        visible: !!state.key,
        empty: !date && !time,
        dateText: formatDate(date),
        timeText: formatTime(time),
        place,
        weather,
        raw,
        manual,
        mode: s.mode,
        flowers: !!s.flowers,
        adaptive: !!s.adaptiveDecor,
        decor: detectDecor(date, time, weather),
    };
}

/* ------------------------------------------------------------------ */
/*  Панель                                                              */
/* ------------------------------------------------------------------ */

function template(vm) {
    const d = decorFor(vm.decor, vm.adaptive);
    const flowers =
        `<span class="sora-fl sora-fl-a">${d.a}</span>` +
        `<span class="sora-fl sora-fl-b">${d.b}</span>` +
        `<span class="sora-fl sora-fl-c${d.cStar ? ' sora-fl-star' : ''}">${d.c}</span>`;

    const modeTitle = `Режим: ${MODE_LABELS[vm.mode]} — нажмите, чтобы переключить`;
    const buttons =
        `<div class="sora-btns">` +
        `<button type="button" class="sora-btn" data-act="mode" title="${esc(modeTitle)}" aria-label="${esc(modeTitle)}">${ICON.chevron}</button>` +
        (vm.mode === 'expanded'
            ? `<button type="button" class="sora-btn" data-act="refresh" title="Обновить" aria-label="Обновить">${ICON.refresh}</button>`
            : '') +
        `</div>`;

    let main;
    if (vm.empty) {
        main = `<div class="sora-row sora-empty"><span class="sora-item">${ICON.cal}<span class="sora-txt">Игровое время не найдено</span></span></div>`;
    } else {
        const items = [];
        if (vm.dateText) items.push(`<span class="sora-item sora-date">${ICON.cal}<span class="sora-txt">${esc(vm.dateText)}</span></span>`);
        if (vm.timeText) items.push(`<span class="sora-item sora-time">${ICON.clock}<span class="sora-txt">${esc(vm.timeText)}</span></span>`);
        main = `<div class="sora-row sora-row-main">${items.join('')}${vm.manual ? `<span class="sora-manual" title="Ручные значения">${ICON.pencil}</span>` : ''}</div>`;

        if (vm.mode !== 'compact' && vm.place) {
            main += `<div class="sora-row sora-row-place" title="${esc(vm.place)}"><span class="sora-item sora-place">${ICON.pin}<span class="sora-txt">${esc(vm.place)}</span></span></div>`;
        }
        if (vm.mode === 'expanded') {
            let extra = '';
            if (vm.weather) extra += `<div class="sora-row sora-row-weather"><span class="sora-item">${ICON.cloud}<span class="sora-txt">${esc(vm.weather)}</span></span></div>`;
            if (vm.raw) extra += `<div class="sora-raw">${esc(vm.raw)}</div>`;
            if (extra) main += `<div class="sora-extra">${extra}</div>`;
        }
    }

    return `${flowers}<div class="sora-main">${main}</div>${buttons}`;
}

function onPanelClick(e) {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    e.preventDefault();
    e.stopPropagation();
    if (b.dataset.act === 'mode') cycleMode();
    else if (b.dataset.act === 'refresh') forceRefresh();
}

// Не отбирать фокус у поля ввода (клавиатура на телефоне остаётся открытой).
function onPanelPointerDown(e) {
    if (e.target.closest('[data-act]')) e.preventDefault();
}

function createPanel() {
    const el = document.createElement('div');
    el.id = PANEL_ID;
    el.className = 'sora-cal';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'off');
    el.addEventListener('click', onPanelClick);
    el.addEventListener('pointerdown', onPanelPointerDown);
    return el;
}

/** Гарантирует, что панель стоит прямо над строкой ввода. */
function mount() {
    const form = document.getElementById('send_form');
    if (!form) return null;
    if (!panelEl) panelEl = document.getElementById(PANEL_ID) || createPanel();

    const anchor = document.getElementById('nonQRFormItems') || document.getElementById('send_textarea')?.parentElement;
    const parent = anchor && form.contains(anchor) ? anchor.parentElement : form;

    if (anchor && parent && panelEl.parentElement === parent && panelEl.nextElementSibling === anchor) return panelEl;
    if (anchor && parent) parent.insertBefore(panelEl, anchor);
    else if (panelEl.parentElement !== form) form.prepend(panelEl);
    return panelEl;
}

function render() {
    if (!active) return;
    const el = mount();
    if (!el) return;
    const s = getSettings();
    const vm = compose(s);

    el.classList.toggle('sora-hidden', !vm.visible);
    el.classList.toggle('sora-no-flowers', !vm.flowers);
    for (const m of MODES) el.classList.toggle('sora-mode-' + m, m === vm.mode);
    el.classList.toggle('sora-is-empty', vm.empty);
    const dc = decorFor(vm.decor, vm.adaptive);
    el.dataset.season = dc.season;
    el.dataset.dp = dc.dp;
    el.dataset.tone = dc.tone;

    const setVar = (name, val) => (val ? el.style.setProperty(name, val) : el.style.removeProperty(name));
    setVar('--sora-c-text', s.textColor);
    setVar('--sora-c-border', s.borderColor);
    setVar('--sora-c-bg', s.bgColor);
    el.style.setProperty('--sora-op', `${Math.min(100, Math.max(0, Number(s.bgOpacity) || 0))}%`);

    const sig = JSON.stringify(vm);
    if (el.dataset.sig !== sig) {
        el.dataset.sig = sig;
        el.innerHTML = template(vm);
    }
}

function cycleMode() {
    const s = getSettings();
    s.mode = MODES[(MODES.indexOf(s.mode) + 1) % MODES.length];
    saveSettings();
    render();
    syncSettingsUI();
}

/* ------------------------------------------------------------------ */
/*  События SillyTavern                                                 */
/* ------------------------------------------------------------------ */

const onAnyChange = () => schedule(120);
const onAppReady = () => {
    mount();
    schedule(0);
};

const HANDLERS = [
    ['CHAT_CHANGED', onChatChanged],
    ['MESSAGE_RECEIVED', onAnyChange],
    ['MESSAGE_SENT', onAnyChange],
    ['MESSAGE_EDITED', onAnyChange],
    ['MESSAGE_UPDATED', onAnyChange],
    ['MESSAGE_DELETED', onAnyChange],
    ['MESSAGE_SWIPED', onAnyChange],
    ['MESSAGE_SWIPE_DELETED', onAnyChange],
    ['GENERATION_ENDED', onAnyChange],
    ['GROUP_UPDATED', onAnyChange],
    ['APP_READY', onAppReady],
];

function bind() {
    const { eventSource, event_types } = getCtx();
    for (const [name, fn] of HANDLERS) {
        const ev = event_types?.[name];
        if (!ev) continue;
        eventSource.on(ev, fn);
        bound.push([ev, fn]);
    }
}

function unbind() {
    try {
        const { eventSource } = getCtx();
        for (const [ev, fn] of bound) eventSource.removeListener(ev, fn);
    } catch { /* ignore */ }
    bound = [];
}

/* ------------------------------------------------------------------ */
/*  Включение / выключение                                              */
/* ------------------------------------------------------------------ */

function activate() {
    if (active) return;
    active = true;
    bind();
    mountWithRetry();
    refresh();
}

function deactivate() {
    active = false;
    clearTimeout(timer);
    clearTimeout(lateTimer);
    clearInterval(mountRetry);
    timer = lateTimer = mountRetry = null;
    unbind();
    if (panelEl) {
        panelEl.removeEventListener('click', onPanelClick);
        panelEl.removeEventListener('pointerdown', onPanelPointerDown);
        panelEl.remove();
        panelEl = null;
    }
    state.key = null;
    state.cache.clear();
    state.result = null;
}

/** Форма ввода может появиться позже загрузки расширения — пробуем несколько секунд. */
function mountWithRetry() {
    clearInterval(mountRetry);
    if (mount()) return;
    let tries = 0;
    mountRetry = setInterval(() => {
        if (!active || mount() || ++tries > 40) {
            clearInterval(mountRetry);
            mountRetry = null;
            if (active) render();
        }
    }, 500);
}

function destroy() {
    deactivate();
    document.getElementById(SETTINGS_ID)?.remove();
    window.removeEventListener('pagehide', destroy);
    if (window.SoraRPCalendar && window.SoraRPCalendar.destroy === destroy) delete window.SoraRPCalendar;
}

/* ------------------------------------------------------------------ */
/*  Настройки (панель Extensions)                                       */
/* ------------------------------------------------------------------ */

const $id = (id) => document.getElementById(id);

function colorRow(id, label) {
    return `<div class="sora-set-row">
        <label for="${id}">${label}</label>
        <span class="sora-set-ctl">
            <input type="color" id="${id}" value="#999999">
            <button type="button" class="menu_button sora-set-reset" data-reset="${id}" title="Сбросить на цвет темы">Сброс</button>
        </span>
    </div>`;
}

function buildSettingsUI() {
    if ($id(SETTINGS_ID)) return;
    const host = $id('extensions_settings2') || $id('extensions_settings');
    if (!host) return;

    const wrap = document.createElement('div');
    wrap.id = SETTINGS_ID;
    wrap.className = 'sora-settings';
    wrap.innerHTML = `
    <div class="inline-drawer">
        <div class="inline-drawer-toggle inline-drawer-header">
            <b>Sora RP Calendar</b>
            <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
        <div class="inline-drawer-content">
            <label class="checkbox_label" for="sora_set_enabled">
                <input type="checkbox" id="sora_set_enabled">
                <span>Показывать календарь над полем ввода</span>
            </label>

            <div class="sora-set-row">
                <label for="sora_set_mode">Режим</label>
                <select id="sora_set_mode" class="text_pole">
                    ${MODES.map((m) => `<option value="${m}">${MODE_LABELS[m]}</option>`).join('')}
                </select>
            </div>

            ${colorRow('sora_set_text', 'Цвет текста')}
            ${colorRow('sora_set_border', 'Цвет рамки')}
            ${colorRow('sora_set_bg', 'Цвет фона')}

            <div class="sora-set-row">
                <label for="sora_set_op">Прозрачность фона: <span id="sora_set_op_val"></span></label>
                <input type="range" id="sora_set_op" min="0" max="100" step="5">
            </div>

            <label class="checkbox_label" for="sora_set_flowers">
                <input type="checkbox" id="sora_set_flowers">
                <span>Декор (узоры по краям)</span>
            </label>
            <label class="checkbox_label" for="sora_set_adaptive">
                <input type="checkbox" id="sora_set_adaptive">
                <span>Узоры меняются по сезону, времени суток и погоде</span>
            </label>

            <hr>
            <div class="sora-set-title">Текущий чат</div>
            <div id="sora_set_status" class="sora-set-status"></div>
            <div class="sora-set-btns">
                <button type="button" id="sora_set_refresh" class="menu_button">Обновить из истории</button>
            </div>

            <div class="sora-set-title">Ручная установка (только для этого чата)</div>
            <label class="checkbox_label" for="sora_man_enabled">
                <input type="checkbox" id="sora_man_enabled">
                <span>Использовать ручные значения</span>
            </label>
            <div class="sora-set-row"><label for="sora_man_date">Дата</label>
                <input type="text" id="sora_man_date" class="text_pole" placeholder="23.11.2010"></div>
            <div class="sora-set-row"><label for="sora_man_time">Время</label>
                <input type="text" id="sora_man_time" class="text_pole" placeholder="14:24"></div>
            <div class="sora-set-row"><label for="sora_man_place">Место</label>
                <input type="text" id="sora_man_place" class="text_pole" placeholder="Berry University"></div>
            <div class="sora-set-btns">
                <button type="button" id="sora_man_apply" class="menu_button">Применить</button>
                <button type="button" id="sora_man_clear" class="menu_button">Сбросить</button>
            </div>
            <div id="sora_man_msg" class="sora-set-status"></div>
            <small class="sora-set-note">Пустые поля берутся из инфоблоков. Расширение ничего не добавляет в промпт и не меняет сообщения.</small>
        </div>
    </div>`;
    host.appendChild(wrap);
    wireSettingsUI();
}

function wireSettingsUI() {
    const s = () => getSettings();
    const changed = () => {
        saveSettings();
        render();
    };

    $id('sora_set_enabled').addEventListener('change', (e) => {
        s().enabled = e.target.checked;
        saveSettings();
        if (s().enabled) activate();
        else deactivate();
        syncSettingsUI();
    });
    $id('sora_set_mode').addEventListener('change', (e) => {
        s().mode = e.target.value;
        changed();
    });
    for (const [id, key] of [['sora_set_text', 'textColor'], ['sora_set_border', 'borderColor'], ['sora_set_bg', 'bgColor']]) {
        $id(id).addEventListener('input', (e) => {
            s()[key] = e.target.value;
            e.target.dataset.custom = '1';
            changed();
        });
    }
    wrap().querySelectorAll('[data-reset]').forEach((btn) =>
        btn.addEventListener('click', () => {
            const map = { sora_set_text: 'textColor', sora_set_border: 'borderColor', sora_set_bg: 'bgColor' };
            s()[map[btn.dataset.reset]] = '';
            changed();
            syncSettingsUI();
        }),
    );
    $id('sora_set_op').addEventListener('input', (e) => {
        s().bgOpacity = Number(e.target.value);
        $id('sora_set_op_val').textContent = e.target.value + '%';
        changed();
    });
    $id('sora_set_flowers').addEventListener('change', (e) => {
        s().flowers = e.target.checked;
        changed();
    });
    $id('sora_set_adaptive').addEventListener('change', (e) => {
        s().adaptiveDecor = e.target.checked;
        changed();
    });
    $id('sora_set_refresh').addEventListener('click', () => {
        if (active) forceRefresh();
    });

    $id('sora_man_apply').addEventListener('click', () => {
        const msg = $id('sora_man_msg');
        if (!state.key) return void (msg.textContent = 'Сначала откройте чат.');
        const date = $id('sora_man_date').value.trim();
        const time = $id('sora_man_time').value.trim();
        const place = $id('sora_man_place').value.trim();
        if (date && !parseDate(date)) return void (msg.textContent = 'Не удалось разобрать дату. Пример: 23.11.2010');
        if (time && !parseTime(time)) return void (msg.textContent = 'Не удалось разобрать время. Пример: 14:24 или 2:24 PM');
        s().manual[state.key] = { enabled: $id('sora_man_enabled').checked, date, time, place };
        saveSettings();
        msg.textContent = 'Сохранено.';
        render();
    });
    $id('sora_man_clear').addEventListener('click', () => {
        if (state.key) delete s().manual[state.key];
        saveSettings();
        render();
        syncSettingsUI();
        $id('sora_man_msg').textContent = 'Ручные значения сброшены.';
    });
}

const wrap = () => $id(SETTINGS_ID);

function syncSettingsUI() {
    if (!wrap()) return;
    const s = getSettings();
    $id('sora_set_enabled').checked = !!s.enabled;
    $id('sora_set_mode').value = s.mode;
    $id('sora_set_flowers').checked = !!s.flowers;
    $id('sora_set_adaptive').checked = !!s.adaptiveDecor;
    $id('sora_set_op').value = s.bgOpacity;
    $id('sora_set_op_val').textContent = s.bgOpacity + '%';
    for (const [id, key] of [['sora_set_text', 'textColor'], ['sora_set_border', 'borderColor'], ['sora_set_bg', 'bgColor']]) {
        const input = $id(id);
        if (s[key] && /^#[0-9a-f]{6}$/i.test(s[key])) input.value = s[key];
        input.classList.toggle('sora-auto', !s[key]);
    }

    // статус
    const status = $id('sora_set_status');
    const r = state.result;
    if (!active) status.textContent = 'Календарь выключен.';
    else if (!state.key) status.textContent = 'Чат не открыт.';
    else if (!r) status.textContent = 'Игровое время не найдено.';
    else status.textContent = `Найдено: ${[formatDate(r.date), formatTime(r.time), r.place].filter(Boolean).join(' • ')}`;

    // ручные поля — только когда не редактируются
    const man = (state.key && s.manual[state.key]) || null;
    const focused = document.activeElement && wrap().contains(document.activeElement) && /sora_man_/.test(document.activeElement.id || '');
    if (!focused) {
        $id('sora_man_enabled').checked = !!man?.enabled;
        $id('sora_man_date').value = man?.date || '';
        $id('sora_man_time').value = man?.time || '';
        $id('sora_man_place').value = man?.place || '';
    }
    for (const id of ['sora_man_enabled', 'sora_man_date', 'sora_man_time', 'sora_man_place', 'sora_man_apply', 'sora_man_clear']) {
        $id(id).disabled = !state.key;
    }
}

/* ------------------------------------------------------------------ */
/*  Запуск                                                              */
/* ------------------------------------------------------------------ */

function init() {
    const s = getSettings();
    buildSettingsUI();
    syncSettingsUI();
    window.addEventListener('pagehide', destroy);
    window.SoraRPCalendar = { version: VERSION, refresh: forceRefresh, destroy };
    if (s.enabled) activate();
    syncSettingsUI();
}

try {
    init();
} catch (err) {
    console.error('[Sora RP Calendar] init failed', err);
}
