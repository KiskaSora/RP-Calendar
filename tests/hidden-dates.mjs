import assert from 'node:assert/strict';
import test from 'node:test';
import { formatDate, formatTime, parseMessage, scanChat } from '../parser.js';

const rp = '<!-- [RP_DATE:18.07.2025 11:24] -->';
const tel = '<!--tel:time:23:06 01.12.2025-->';
const visible = '<infoblock>Date: 02.05.2024 | Time: 05:55 | Location: сад | Weather: дождь</infoblock>';

test('both hidden formats produce a validated date and time in message order', () => {
    for (const [message, date, time] of [
        [rp, '18.07.2025, пт', '11:24'],
        [tel, '01.12.2025, пн', '23:06'],
        [rp + tel, '01.12.2025, пн', '23:06'],
        [tel + visible, '02.05.2024, чт', '05:55'],
        [visible + rp, '18.07.2025, пт', '11:24'],
    ]) {
        const block = parseMessage(message);
        assert.equal(formatDate(block.date), date);
        assert.equal(formatTime(block.time), time);
    }
});

test('hidden time can be combined with place and weather in the same message', () => {
    for (const message of [visible + rp, rp + '\nLocation: сад | Weather: дождь']) {
        const block = parseMessage(message);
        assert.equal(block.place, 'сад');
        assert.equal(block.weather, 'дождь');
    }
});

test('invalid markers do not replace valid times after edits or swipes', () => {
    const cache = new Map();
    const chat = [{ mes: visible }, { mes: rp }];
    assert.equal(formatTime(scanChat(chat, cache).time), '11:24');
    for (const invalid of ['<!--tel:time:25:44 01.12.2025-->', '<!-- [RP_DATE:31.02.2025 11:24] -->']) {
        chat[1].mes = invalid;
        assert.equal(parseMessage(invalid), null);
        assert.equal(formatTime(scanChat(chat, cache).time), '05:55');
    }
});
