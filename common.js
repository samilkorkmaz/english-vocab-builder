// Shared helpers used by both background.js (service worker) and popup.js

// Placeholder texts that are not real definitions (never used in the quiz)
const DEFINITION_NOT_FOUND = "Definition not found.";
const DEFINITION_ERROR = "Error while fetching the definition.";
const SENTENCE_PLACEHOLDER = "Sentence/Example Text";
const PLACEHOLDER_DEFINITIONS = [SENTENCE_PLACEHOLDER, DEFINITION_NOT_FOUND, DEFINITION_ERROR];

const HISTORY_LIMIT = 2000; // Maximum number of stored answer records

// All reads/writes go through here; if the storage location changes, only this object changes
const Store = {
  async getVocab() {
    const { vocabList } = await chrome.storage.local.get({ vocabList: [] });
    return vocabList;
  },

  saveVocab(vocabList) {
    return chrome.storage.local.set({ vocabList });
  },

  async getHistory() {
    const { answerHistory } = await chrome.storage.local.get({ answerHistory: [] });
    return answerHistory;
  },

  async addHistory(record) {
    const history = await Store.getHistory();
    history.push(record);
    return chrome.storage.local.set({ answerHistory: history.slice(-HISTORY_LIMIT) });
  },

  // Restore from backup: replaces all existing data
  replaceAll(vocabList, answerHistory) {
    return chrome.storage.local.set({ vocabList, answerHistory: answerHistory.slice(-HISTORY_LIMIT) });
  },

  // Deletes all words and the quiz history
  clearAll() {
    return chrome.storage.local.remove(["vocabList", "answerHistory"]);
  }
};

function hasRealDefinition(item) {
  return Boolean(item.definition) && !PLACEHOLDER_DEFINITIONS.includes(item.definition);
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Replaces the word in the sentence (whole word, case-insensitive) with a blank; returns null if the word doesn't appear
function blankWord(sentence, word) {
  if (!sentence || !word) return null;
  const wordPattern = escapeRegExp(word).replace(/'/g, "['’]");
  const pattern = new RegExp(`(?<![\\p{L}'’-])${wordPattern}(?![\\p{L}'’-])`, "giu");
  const blanked = sentence.replace(pattern, "_____");
  return blanked === sentence ? null : blanked;
}
