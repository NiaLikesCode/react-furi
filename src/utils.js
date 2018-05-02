import { stripOkurigana, tokenize, isKanji, isHiragana, isKatakana } from 'wanakana';
import zip from 'just-zip-it';

/**
 * Combines furigana with kanji into an array of string pairs.
 * @param  {String} word vocab kanji word
 * @param  {String} reading vocab kana reading
 * @param  {String|Object} furi furigana placement info
 * @return {Array} furigana/kanji pairs
 * @example
 * combineFuri('お世辞', 'おせじ', '1:せ;2:じ')
 * // => [['', 'お'], ['せ', '世'], ['じ', '辞']]
 * combineFuri('大人しい', 'おとなしい') // smart fallbacks
 * // => [['おとな', '大人'], ['', 'しい']]
 * combineFuri('使い方', 'つかいかた') // smart fallbacks
 * // => [['つか', '使'], ['', 'い'], ['かた', '方']]
 *
 * // special compound readings (義訓/熟字訓) are spread across relevant kanji
 * combineFuri('胡座', 'あぐら', '0:あぐら')
 * // => [['あぐら', '胡座']]
 */
export function combineFuri(word = '', reading = '', furi = '') {
  const furiLocs = parseFuri(furi);
  // 義訓/熟字訓 words with a single furi loc: 今日 "0:きょう"
  const isSpecialReading = furiLocs.length === 1 && [...word].every(isKanji);
  const isKanaWord = ![...word].some(isKanji);
  const isWanikaniMadness = [...reading].some(isHiragana) && [...reading].some(isKatakana);

  if (word === reading || isKanaWord) {
    return [['', word]];
  }

  if (!furi || isSpecialReading || isWanikaniMadness) {
    return basicFuri(word, reading);
  }

  return generatePairs(word, furiLocs);
}

/**
 * Displays simple furigana by separating kanji and kana
 * @param  {String} [word=''] 'お見舞い'
 * @param  {String} [reading=''] 'おみまい'
 * @return {Array} [['', 'お'], ['見舞', 'みま'], ['', 'い']]
 */
export function basicFuri(word = '', reading = '') {
  // FIXME: refactor works, now simplify + cleanup code
  const [bikago, okurigana] = [
    reading.slice(0, word.length - stripOkurigana(word, { leading: true }).length),
    reading.slice(stripOkurigana(reading, { matchKanji: word }).length),
  ];
  const removeExtraneousKana = (str) =>
    str.replace(RegExp(`^${bikago}`), '').replace(RegExp(`${okurigana}$`), '');
  const wordInner = removeExtraneousKana(word);
  const readingInner = removeExtraneousKana(reading);
  const kanjiSplit = tokenize(wordInner);

  const re = RegExp(kanjiSplit.map((x) => (isKanji(x) ? '(.*)' : `(${x})`)).join(''));
  const [, ...kanaSplit] = readingInner.match(re) || [];

  // always kanji odd, kana even [kj], [kj, ka, kj] or [kj, ka, kj, ka, kj]
  const removeRedundantReadings = ([a, b]) => (a === b || !a ? ['', b] : [a, b]);

  const ret = zip(kanaSplit, kanjiSplit).map(removeRedundantReadings);

  if (bikago) {
    ret.unshift(['', bikago]);
  }

  if (okurigana) {
    ret.push(['', okurigana]);
  }

  return ret;
}

export function parseFuri(data) {
  return typeof data === 'string' ? parseFuriString(data) : parseFuriObject(data);
}

/**
 * Parses furigana placement object
 * @param  {Object} [locations={}] { 1:'せ', 2:'じ' }
 * @return {Array} [ [[1, 2], 'せ'], [[2, 3], 'じ'] ]
 */
function parseFuriObject(locations = {}) {
  return Object.entries(locations).map(([start, content]) => [
    [Number(start), Number(start) + 1],
    content,
  ]);
}

/**
 * Parses furigana placement string
 * @param  {String} [locations=''] '1:せ;2:じ'
 * @return {Array} [ [[1, 2], 'せ'], [[2, 3], 'じ'] ]
 */
function parseFuriString(locations = '') {
  return locations.split(';').map((entry) => {
    const [indexes, content] = entry.split(':');
    const [start, end] = indexes.split('-').map(Number);
    // NOTE: in the JMDict furistring data, the end index is either missing
    // or it is listed as the *start* index of the final char ¯\_(ツ)_/¯
    // so we need to bump it either way to encompass that char
    return [[start, end ? end + 1 : start + 1], content];
  });
}

/**
 * Generates array pairs consisting of furigana and kanji
 * @param  {String} word 'お世辞'
 * @param  {Array} furiLocs [[[1, 2], 'せ'], [[2, 3], 'じ']]
 * @return {Array} [['', 'お'], ['せ', '世'], ['じ', '辞']]
 */
export function generatePairs(word = '', furiLocs = []) {
  let prevCharEnd = 0;

  return furiLocs.reduce((pairs, [[start, end], furiText], index, source) => {
    // if no furigana at this index, add intervening chars
    if (start !== prevCharEnd) {
      pairs.push(['', word.slice(prevCharEnd, start)]);
    }

    // add furigana and associated chars
    pairs.push([furiText, word.slice(start, end)]);

    // if no more furigana left, add any remaining chars/okurigana with blank furi
    if (end < word.length && !source[index + 1]) {
      pairs.push(['', word.slice(end)]);
    }

    prevCharEnd = end;
    return pairs;
  }, []);
}