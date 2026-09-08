// ==UserScript==
// @name         5Kings Bot SMOKE TEST
// @namespace    https://5kings.ru/
// @version      0.0.1
// @description  Проверка: если видите красную полосу — Tampermonkey на 5kings работает
// @match        *://5kings.ru/*
// @match        *://*.5kings.ru/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';
  console.log('[5k-smoke] OK', location.href);
  function paint() {
    var d = document;
    try {
      if (window.top && window.top.document) d = window.top.document;
    } catch (e) {}
    if (!d.body) return setTimeout(paint, 200);
    var el = d.getElementById('k5-smoke');
    if (el) return;
    el = d.createElement('div');
    el.id = 'k5-smoke';
    el.style.cssText =
      'position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#b00;color:#fff;' +
      'padding:12px;font:bold 16px Tahoma;text-align:center';
    el.textContent = 'TAMPERMONKEY OK на 5kings — можно ставить 5Kings Bot v1.0.4';
    d.body.appendChild(el);
  }
  paint();
})();
