/*! 正经素材库 © 2026 小橙子工作室（XXCHENGZI）保留所有权利。未经书面许可，禁止复制、修改、传播或用于其他项目。详见 LICENSE。 */
// 拼音搜索：名称可以用全拼、首字母，或两者混着打（每个字打全拼、首字母或 zh/ch/sh），最后一个字可以只打一半。
// 打分与 Eliya 拼音搜索插件（Core/functions/pinyin_search.py）一致：完全相同 > 开头相同 > 包含，再用混合拼音兜底；
// 多音字的每个读音都能搜到。拼音表见 pinyin-data.js。
(function (root) {
  'use strict';
  const HAN = /[㐀-䶿一-鿿]/;
  const compact = value => String(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
  let table = null;
  // 字 → 读音列表（第一个是最常用的读音）。
  function load() {
    if (table) return table;
    table = new Map();
    const data = root.StudioPinyinData || { primary: '', extra: '' };
    for (const group of data.primary.split(' ')) {
      const [syllable, chars = ''] = group.split(':');
      for (const ch of chars) table.set(ch, [syllable]);
    }
    for (const group of data.extra.split(' ')) {
      const [syllable, chars = ''] = group.split(':');
      for (const ch of chars) table.get(ch)?.push(syllable);
    }
    return table;
  }
  // 名称拆成一段段：汉字给出所有读音，字母数字原样，空格和标点不参与。
  const cache = new Map();
  function analyze(name) {
    let info = cache.get(name);
    if (info) return info;
    const map = load(), units = [];
    for (const ch of String(name).toLowerCase()) {
      const readings = map.get(ch);
      if (readings) units.push(readings);
      else if (/[a-z0-9]/.test(ch)) units.push([ch]);
    }
    // 混合匹配时每段能打的写法：全拼、首字母，翘舌音还可以打 zh/ch/sh。
    const forms = units.map(readings => [...new Set(readings.flatMap(r => r.length > 1 && /^[a-z]+$/.test(r)
      ? [r, r[0], ...(/^(zh|ch|sh)/.test(r) ? [r.slice(0, 2)] : [])] : [r]))]);
    info = { han: HAN.test(name), full: units.map(u => u[0]).join(''), initials: units.map(u => u[0][0]).join(''), forms };
    if (cache.size > 20000) cache.clear();
    cache.set(name, info);
    return info;
  }
  // 记录查询串走到了哪里，不展开所有组合；从任意一个字开始、连续往后匹配。
  function mixed(query, forms) {
    let positions = new Set();
    for (const options of forms) {
      positions.add(0);
      const next = new Set();
      for (const offset of positions) {
        const rest = query.slice(offset);
        for (const form of options) {
          if (form.startsWith(rest)) return true;
          if (query.startsWith(form, offset)) next.add(offset + form.length);
        }
      }
      positions = next;
    }
    return false;
  }
  function pinyinScore(query, name) {
    const q = compact(query);
    if (!q) return 0;
    const info = analyze(name);
    if (!info.han) return 0;
    let best = 0;
    if (q === info.full) best = 145; else if (info.full.startsWith(q)) best = 130; else if (info.full.includes(q)) best = 90;
    if (q === info.initials) best = Math.max(best, 150); else if (info.initials.startsWith(q)) best = Math.max(best, 125); else if (info.initials.includes(q)) best = Math.max(best, 80);
    if (best) return best;
    return mixed(q, info.forms) ? 100 : 0;
  }
  const stem = name => String(name).replace(/\.[a-z0-9]{1,8}$/i, '');
  // 名称原文匹配 + 名称拼音匹配；所在文件夹只作补充（原文或拼音命中都加一点分）。
  function score(query, name, folders = [], extra = '') {
    const q = String(query).toLowerCase().trim();
    if (!q) return 0;
    const n = String(name).toLowerCase();
    let total = 0;
    if (n.includes(q)) total += 100;
    if (n.startsWith(q)) total += 50;
    total += pinyinScore(q, stem(name));
    const around = [...folders, extra].join(' ').toLowerCase();
    if (around.includes(q)) total += 20;
    else if (folders.some(folder => pinyinScore(q, folder))) total += 20;
    return total;
  }
  const api = { score, pinyinScore, analyze };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.StudioPinyin = api;
})(typeof window !== 'undefined' ? window : globalThis);
