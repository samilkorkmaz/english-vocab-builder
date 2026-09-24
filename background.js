importScripts("common.js");

// Create the right-click menu item
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "add-vocab",
      title: "Add to Vocabulary",
      contexts: ["selection"]
    });
  });
  retryFailedDefinitions();
});

// Retry words whose definition couldn't be fetched because the dictionary was unreachable (install/update)
async function retryFailedDefinitions() {
  const failedWords = (await Store.getVocab())
    .filter(item => item.word && item.definition === DEFINITION_ERROR)
    .map(item => item.word);

  const newDefinitions = new Map();
  for (const word of failedWords) {
    newDefinitions.set(word, await fetchDefinition(word));
  }
  if (newDefinitions.size === 0) return;

  // Words may have been added while definitions were being fetched, so the list is read again
  const vocabList = await Store.getVocab();
  vocabList.forEach(item => {
    if (item.definition === DEFINITION_ERROR && newDefinitions.has(item.word)) {
      item.definition = newDefinitions.get(item.word);
    }
  });
  await Store.saveVocab(vocabList);
}

// Logic that runs when the menu item is clicked
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "add-vocab" || !info.selectionText) return;
  const rawText = info.selectionText.trim();
  if (!rawText) return;

  try {
    // Check whether the selection is a single word or a sentence
    const isSingleWord = rawText.split(/\s+/).length === 1;
    const saved = isSingleWord ? await addWord(rawText, info, tab) : await addSentence(rawText);
    if (saved) showBadge(tab, "✓", "#28a745");
  } catch (error) {
    console.error("Could not add word:", error);
    showBadge(tab, "!", "#dc3545");
  }
});

// Single word: the definition is fetched from the dictionary, the sentence it appears in is taken from the page automatically
async function addWord(rawText, info, tab) {
  const word = cleanWord(rawText);
  if (!word) return false;

  const sentence = await getSentenceFromPage(tab, info.frameId, word);
  const vocabList = await Store.getVocab();
  const existing = vocabList.find(item => item.word === word);

  if (existing) {
    // The same word isn't added twice; its missing information is filled in
    if (sentence && !existing.contextSentence) existing.contextSentence = sentence;
    if (!hasRealDefinition(existing)) existing.definition = await fetchDefinition(word);
  } else {
    vocabList.push(createEntry(word, await fetchDefinition(word), sentence));
  }

  await Store.saveVocab(vocabList);
  return true;
}

// Multiple words: saved as an example sentence, attached to the most recently added word that appears in it
async function addSentence(rawText) {
  const sentence = rawText.replace(/\s+/g, " ");
  const vocabList = await Store.getVocab();
  const match = [...vocabList].reverse().find(item => blankWord(sentence, item.word));

  if (match) {
    match.contextSentence = sentence;
  } else {
    vocabList.push(createEntry("", "", sentence));
  }

  await Store.saveVocab(vocabList);
  return true;
}

function createEntry(word, definition, contextSentence) {
  return {
    id: Date.now(),
    word: word,
    definition: definition,
    contextSentence: contextSentence,
    box: 1, // Leitner / flashcard box (tracks review frequency)
    nextReview: Date.now(), // Next review time (can be asked right away)
    correctCount: 0,
    wrongCount: 0,
    dateAdded: new Date().toLocaleDateString()
  };
}

// Get the sentence containing the selected word from the page (the context menu grants the activeTab permission)
async function getSentenceFromPage(tab, frameId, word) {
  if (!tab?.id) return "";
  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId: tab.id, frameIds: [frameId ?? 0] },
      func: extractSelectedSentence
    });
    const sentence = injection?.result || "";
    // "Sentences" consisting of just the word itself (headings etc.) aren't saved
    return blankWord(sentence, word) && cleanWord(sentence) !== word ? sentence : "";
  } catch (error) {
    // chrome:// pages, the Web Store and some PDFs don't allow running scripts
    return "";
  }
}

// Runs inside the page, so it can't use any function defined outside it
function extractSelectedSentence() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return "";
  const range = selection.getRangeAt(0);

  // Find the nearest block element containing the selection (paragraph, list item, table cell...)
  let block = range.startContainer.nodeType === Node.ELEMENT_NODE
    ? range.startContainer
    : range.startContainer.parentElement;
  while (block && block !== document.body && /^inline/.test(getComputedStyle(block).display)) {
    block = block.parentElement;
  }
  if (!block) return "";

  // Position of the selection within the block's text
  const text = block.textContent;
  const beforeRange = document.createRange();
  beforeRange.selectNodeContents(block);
  beforeRange.setEnd(range.startContainer, range.startOffset);
  const start = beforeRange.toString().length;
  const end = start + range.toString().length;

  // Search on both sides of the selection for a sentence end (. ! ? … followed by whitespace)
  const isBoundary = i => /[.!?…]/.test(text[i]) && (i + 1 >= text.length || /\s/.test(text[i + 1]));
  let sentenceStart = start;
  while (sentenceStart > 0 && !isBoundary(sentenceStart - 1)) sentenceStart--;
  let sentenceEnd = end;
  while (sentenceEnd < text.length && !isBoundary(sentenceEnd)) sentenceEnd++;
  sentenceEnd = Math.min(sentenceEnd + 1, text.length);

  // Without punctuation (lists, menus etc.) take at most 200 characters on each side of the word
  const from = Math.max(sentenceStart, start - 200);
  const to = Math.min(sentenceEnd, end + 200);
  const sentence = text.slice(from, to).replace(/\s+/g, " ").trim();
  return (from > sentenceStart ? "…" : "") + sentence + (to < sentenceEnd ? "…" : "");
}

// Briefly show a success/error mark on the extension icon
function showBadge(tab, text, color) {
  const tabId = tab?.id;
  chrome.action.setBadgeBackgroundColor({ color, tabId });
  chrome.action.setBadgeText({ text, tabId });
  setTimeout(() => chrome.action.setBadgeText({ text: "", tabId }), 2000);
}

// Remove everything except letters, apostrophes and hyphens ("don't", "café", "well-known" are kept)
function cleanWord(text) {
  return text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^\p{L}'-]/gu, "")
    .replace(/^['-]+|['-]+$/g, "");
}

const FETCH_TIMEOUT_MS = 8000;

// Fetch a definition: Wiktionary first, dictionaryapi.dev if Wiktionary is unreachable
async function fetchDefinition(word) {
  try {
    return (await fetchFromWiktionary(word)) || DEFINITION_NOT_FOUND;
  } catch (error) {
    console.warn("Wiktionary unreachable, trying the backup dictionary:", error);
  }
  try {
    return (await fetchFromDictionaryApi(word)) || DEFINITION_NOT_FOUND;
  } catch (error) {
    console.warn("Backup dictionary unreachable too:", error);
    return DEFINITION_ERROR;
  }
}

// Each source returns the definition, null if the word doesn't exist, and throws on network/server errors
async function fetchFromWiktionary(word) {
  const response = await fetch(`https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(word)}`, {
    headers: { "Api-User-Agent": "EnglishVocabBuilder/1.1 (Chrome extension)" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Wiktionary HTTP ${response.status}`);

  const data = await response.json();
  // Definitions arrive as HTML; the plain text of the first non-empty one is used
  for (const entry of data.en || []) {
    for (const { definition } of entry.definitions || []) {
      const text = htmlToText(definition || "");
      if (text) return text;
    }
  }
  return null;
}

async function fetchFromDictionaryApi(word) {
  const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`dictionaryapi.dev HTTP ${response.status}`);
  const data = await response.json();
  return data[0]?.meanings[0]?.definitions[0]?.definition || null;
}

// Service workers have no DOMParser, so tags and basic HTML entities are stripped by hand
function htmlToText(html) {
  const entities = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code) => {
      if (code[0] === "#") {
        const num = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
        return String.fromCodePoint(num);
      }
      return entities[code.toLowerCase()] ?? match;
    })
    .replace(/\s+/g, " ")
    .trim();
}
