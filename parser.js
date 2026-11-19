/**
 * Sora RP Calendar — parser.js
 * Чистый модуль без обращения к DOM / SillyTavern: только разбор текста.
 * Никаких запросов, генерации и изменений сообщений.
 */

/* ------------------------------------------------------------------ */
/*  Метки полей                                                        */
/* ------------------------------------------------------------------ */

const LABELS = {
    date: ['Date', 'Дата'],
    time: ['Time', 'Время'],
    place: ['Location', 'Место действия', 'Местоположение', 'Расположение', 'Место', 'Локация', 'Place'],
    weather: ['Weather', 'Погода'],
};

/** Регистронезависимая запись слова через классы символов (работает и для кириллицы без флага i). */
function ci(word) {
    return word
        .split('')
        .map((ch) => {
            if (ch === ' ') return '\\s+';
            const lo = ch.toLowerCase();
            const up = ch.toUpperCase();
            return lo === up ? ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : `[${lo}${up}]`;
        })
        .join('');
}

// Конец значения: разделитель, конец строки либо начало следующего «Ключ:» (напр. «Known:»).
// Внутри ключа допускаются только пробелы/табы (не переводы строк), и «PM»/«AM» ключом не считаются.
const TERM = String.raw`(?=\s*[|•·;\n\]]|[ \t]+(?![AaPp]\.?[Mm]\.?(?:\s|$))\p{Lu}\p{L}*(?:[ \t]\p{L}+){0,2}[ \t]*[:：]|$)`;

function fieldRe(labels) {
    const alt = labels.map(ci).join('|');
    return new RegExp(String.raw`(?:^|[\s|•·;\[(_])(?:${alt})\s*[:：=\-–—][ \t\u00a0]*(.+?)` + TERM, 'mu');
}

const RE = {
    date: fieldRe(LABELS.date),
    time: fieldRe(LABELS.time),
    place: fieldRe(LABELS.place),
    weather: fieldRe(LABELS.weather),
};

const LABEL_ANY = (labels) => new RegExp(String.raw`(?:^|[\s|•·;\[(_>*\x60~])(?:${labels.map(ci).join('|')})\s*[:：=\-–—]`, 'gu');
const RE_DATE_LABEL = LABEL_ANY(LABELS.date);
const RE_TIME_LABEL = LABEL_ANY(LABELS.time);

/* ------------------------------------------------------------------ */
/*  Нормализация текста                                                */
/* ------------------------------------------------------------------ */

function normalize(text) {
    return String(text)
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/?(?:p|div|li|ul|ol|tr|table|h[1-6]|blockquote|pre|details|summary)\b[^>]*>/gi, '\n')
        .replace(/<\/?[A-Za-z][^>]*>/g, '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/[\u00a0\u200b\u2009\u202f]/g, ' ')
        .replace(/\*+|`+|~~/g, '')
        .replace(/\r/g, '');
}

function clean(value) {
    let v = String(value || '').replace(/\s+/g, ' ').trim();
    v = v.replace(/^[_\s]+/, '').replace(/[_\s|\]•·;,]+$/, '');
    // убрать лишнюю закрывающую скобку
    const open = (v.match(/\(/g) || []).length;
    const close = (v.match(/\)/g) || []).length;
    if (close > open) v = v.replace(/\)+$/, '').trim();
    return v;
}

function condense(text) {
    const t = text
        .split('\n')
        .map((l) => l.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .join(' | ');
    return t.length > 500 ? t.slice(0, 497) + '…' : t;
}

/* ------------------------------------------------------------------ */
/*  Дата                                                               */
/* ------------------------------------------------------------------ */

const WD_KEYS = [
    ['вос', 'вс', 'sun'],
    ['пон', 'пн', 'mon'],
    ['вто', 'вт', 'tue'],
    ['сре', 'ср', 'wed'],
    ['чет', 'чт', 'thu'],
    ['пят', 'пт', 'fri'],
    ['суб', 'сб', 'sat'],
];
export const WEEKDAYS_RU = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

const MONTHS = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
    янв: 1, фев: 2, мар: 3, апр: 4, мая: 5, май: 5, июн: 6, июл: 7, авг: 8, сен: 9, окт: 10, ноя: 11, дек: 12,
};
const monthOf = (word) => MONTHS[String(word).toLowerCase().slice(0, 3)] || 0;

function weekdayFromText(s) {
    const tokens = s.match(/\p{L}+/gu) || [];
    for (const raw of tokens) {
        const t = raw.toLowerCase();
        if (t.length > 14) continue;
        for (let i = 0; i < 7; i++) {
            for (const k of WD_KEYS[i]) {
                if (t === k || (k.length === 3 && t.startsWith(k))) return i;
            }
        }
    }
    return null;
}

function validDate(d, m, y) {
    if (!(y >= 1 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return false;
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** @returns {{d:number,m:number,y:number,wd:number}|null} wd: 0=вс … 6=сб */
export function parseDate(str) {
    if (!str) return null;
    const s = String(str).trim();
    let d, m, y, mt;

    if ((mt = s.match(/(?<!\d)(\d{4})([.\/-])(\d{1,2})\2(\d{1,2})(?!\d)/))) {
        y = +mt[1]; m = +mt[3]; d = +mt[4];
    } else if ((mt = s.match(/(?<!\d)(\d{1,2})([.\/-])(\d{1,2})\2(\d{4}|\d{2})(?!\d)/))) {
        const a = +mt[1];
        const b = +mt[3];
        y = +mt[4];
        if (y < 100) y += 2000;
        if (mt[2] === '/' && a <= 12 && b > 12) { m = a; d = b; } else { d = a; m = b; }
    } else if ((mt = s.match(/(\d{1,2})(?:st|nd|rd|th)?\s+(\p{L}{3,})\.?,?\s+(\d{4})/u)) && monthOf(mt[2])) {
        d = +mt[1]; m = monthOf(mt[2]); y = +mt[3];
    } else if ((mt = s.match(/(\p{L}{3,})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/u)) && monthOf(mt[1])) {
        m = monthOf(mt[1]); d = +mt[2]; y = +mt[3];
    } else {
        return null;
    }

    if (!validDate(d, m, y)) return null;
    let wd = weekdayFromText(s);
    if (wd === null) wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    return { d, m, y, wd };
}

export function formatDate(date) {
    if (!date) return '';
    const p = (n) => String(n).padStart(2, '0');
    return `${p(date.d)}.${p(date.m)}.${String(date.y).padStart(4, '0')}, ${WEEKDAYS_RU[date.wd]}`;
}

/* ------------------------------------------------------------------ */
/*  Время                                                              */
/* ------------------------------------------------------------------ */

/** Поддерживает 14:24, 14:24:00, 2:24 PM, 2.24 p.m., 2:24 вечера. @returns {{h:number,m:number}|null} */
export function parseTime(str) {
    if (!str) return null;
    const mt = String(str).match(
        /(?<!\d)(\d{1,2})\s*[:.hч]\s*(\d{2})(?:\s*[:.]\s*\d{2})?(?!\d)\s*(a\.?\s?m\.?|p\.?\s?m\.?|утра|дня|вечера|ночи)?/iu,
    );
    if (!mt) return null;
    let h = +mt[1];
    const m = +mt[2];
    const suf = (mt[3] || '').toLowerCase().replace(/[.\s]/g, '');
    if (suf) {
        if ((suf === 'pm' || suf === 'вечера' || suf === 'дня') && h < 12) h += 12;
        else if ((suf === 'am' || suf === 'утра' || suf === 'ночи') && h === 12) h = 0;
    }
    if (h > 23 || m > 59) return null;
    return { h, m };
}

export function formatTime(time) {
    if (!time) return '';
    const p = (n) => String(n).padStart(2, '0');
    return `${p(time.h)}:${p(time.m)}`;
}

/* ------------------------------------------------------------------ */
/*  Разбор блока и сообщения                                           */
/* ------------------------------------------------------------------ */

function parseBlock(text) {
    const n = normalize(text);
    const get = (re) => {
        const m = re.exec(n);
        return m ? clean(m[1]) : '';
    };
    const date = parseDate(get(RE.date));
    const time = parseTime(get(RE.time));
    if (!date && !time) return null;
    return {
        date,
        time,
        place: get(RE.place),
        weather: get(RE.weather),
        raw: condense(n),
    };
}

function lastLabelIndex(re, text) {
    re.lastIndex = 0;
    let last = -1;
    let m;
    while ((m = re.exec(text))) {
        last = m.index;
        if (m[0].length === 0) re.lastIndex++;
    }
    return last;
}

/** Достаёт последнее игровое время из одного сообщения (или null). */
export function parseMessage(mes) {
    if (typeof mes !== 'string' || mes.length < 6) return null;

    // 1) Явные <infoblock>…</infoblock>: берём последний, который разобрался.
    const blocks = [...mes.matchAll(/<infoblock\b[^>]*>([\s\S]*?)<\/infoblock\s*>/gi)];
    for (let i = blocks.length - 1; i >= 0; i--) {
        const r = parseBlock(blocks[i][1]);
        if (r) return r;
    }

    // 2) Без тегов (старые оформления, незакрытый тег, обычный текст): ищем последнюю метку.
    let idx = lastLabelIndex(RE_DATE_LABEL, mes);
    if (idx < 0) idx = lastLabelIndex(RE_TIME_LABEL, mes);
    if (idx < 0) return null;
    return parseBlock(mes.slice(idx, idx + 900));
}

/**
 * Идёт по чату с конца и собирает актуальное состояние.
 * Останавливается на первом найденном блоке (+ немного назад, если не хватает места).
 * cache: Map<index, {mes, block}> — не парсит повторно неизменённые сообщения.
 */
export function scanChat(chat, cache = new Map()) {
    if (!Array.isArray(chat) || !chat.length) return null;

    for (const k of cache.keys()) if (k >= chat.length) cache.delete(k);

    const found = [];
    let extra = 0;
    for (let i = chat.length - 1; i >= 0; i--) {
        const msg = chat[i];
        if (!msg || typeof msg.mes !== 'string') continue;

        let c = cache.get(i);
        if (!c || c.mes !== msg.mes) {
            c = { mes: msg.mes, block: parseMessage(msg.mes) };
            cache.set(i, c);
        }

        if (c.block) {
            found.push({ ...c.block, index: i });
            const b = found[0];
            if ((b.date && b.time && b.place) || found.length >= 4) break;
        } else if (found.length && ++extra > 40) {
            break;
        }
    }

    if (!found.length) return null;

    const res = { ...found[0] };
    for (let i = 1; i < found.length; i++) {
        const older = found[i];
        if (!res.place && older.place) res.place = older.place;
        if (!res.date && res.time && older.date) res.date = older.date;
    }
    return res;
}

/* ------------------------------------------------------------------ */
/*  Тема узоров: сезон / время суток / погода                          */
/* ------------------------------------------------------------------ */

/**
 * @returns {{season:string|null, daypart:string|null, weather:string}}
 * season: spring|summer|autumn|winter (северное полушарие)
 * daypart: dawn|day|dusk|night
 * weather: storm|snow|rain|fog|partly|cloud|clear|none
 */
export function detectDecor(date, time, weatherText = '') {
    let season = null;
    if (date && date.m) {
        const m = date.m;
        season = m === 12 || m <= 2 ? 'winter' : m <= 5 ? 'spring' : m <= 8 ? 'summer' : 'autumn';
    }

    let daypart = null;
    if (time && Number.isFinite(time.h)) {
        const h = time.h;
        daypart = h >= 5 && h < 8 ? 'dawn' : h >= 8 && h < 17 ? 'day' : h >= 17 && h < 20 ? 'dusk' : 'night';
    }

    const w = String(weatherText || '').toLowerCase();
    const has = (...stems) => stems.some((s) => new RegExp('(?<!\\p{L})' + s, 'u').test(w));

    let weather = 'none';
    if (has('гроз', 'thunder', 'lightning', 'молни', 'storm', 'шторм')) weather = 'storm';
    else if (has('снег', 'снеж', 'snow', 'метел', 'blizzard', 'вьюг', 'sleet')) weather = 'snow';
    else if (has('дожд', 'rain', 'ливн', 'ливен', 'drizzl', 'морос', 'shower', 'слякот', 'hail', 'градин')) weather = 'rain';
    else if (has('туман', 'fog', 'mist(?!ake)', 'haze', 'дымк', 'мгл')) weather = 'fog';
    else if (has('partly', 'переменн', 'малооблач', 'scattered', 'few clouds')) weather = 'partly';
    else if (has('пасмурн', 'облач', 'cloud', 'overcast', 'хмур')) weather = 'cloud';
    else if (has('ясно', 'солнечн', 'солнц', 'sunny', 'clear', 'sun', 'безоблач')) weather = 'clear';

    return { season, daypart, weather };
}
