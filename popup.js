// Review intervals per Leitner box (days): box 1 immediately, box 5 after two weeks
const BOX_INTERVAL_DAYS = { 1: 0, 2: 1, 3: 3, 4: 7, 5: 14 };
const DAY_MS = 24 * 60 * 60 * 1000;
const HISTORY_DAYS_SHOWN = 14;
const BACKUP_APP_ID = 'english-vocab-builder';

// Opened in a full tab instead of the popup? (needed for the restore file picker)
const IS_TAB = new URLSearchParams(location.search).has('tab');

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn));
  });
  document.getElementById('export-html').addEventListener('click', exportHtml);
  document.getElementById('export-csv').addEventListener('click', exportCsv);
  document.getElementById('backup').addEventListener('click', exportBackup);
  document.getElementById('restore').addEventListener('click', startRestore);
  document.getElementById('restore-file').addEventListener('change', restoreBackup);
  document.getElementById('delete-all').addEventListener('click', deleteAll);
  if (IS_TAB) showStatus('Click "Restore" to choose a backup file.');
  document.getElementById('quiz-next').addEventListener('click', initQuiz);

  loadTable();
  initQuiz();
  loadStats();
});

function switchTab(btn) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  document.getElementById(btn.dataset.tab).classList.add('active');
  btn.classList.add('active');
}

// textContent is used so text from web pages is never interpreted as HTML (XSS protection)
function cell(text, bold = false) {
  const td = document.createElement('td');
  if (bold) {
    const b = document.createElement('b');
    b.textContent = text;
    td.appendChild(b);
  } else {
    td.textContent = text;
  }
  return td;
}

function row(...cells) {
  const tr = document.createElement('tr');
  tr.append(...cells);
  return tr;
}

// 1. Render the database as an HTML table
async function loadTable() {
  const vocabList = await Store.getVocab();
  document.getElementById('vocab-table-body').replaceChildren(
    ...vocabList.map(item => row(
      cell(item.word || '-', true),
      cell(item.definition || '-'),
      cell(item.contextSentence || '-')
    ))
  );
}

// Export: HTML table file and CSV
function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"']/g, ch => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
}

function fileDate() {
  return new Date().toISOString().slice(0, 10);
}

async function exportHtml() {
  const vocabList = await Store.getVocab();
  const rows = vocabList.map(item =>
    `      <tr><td><b>${escapeHtml(item.word)}</b></td><td>${escapeHtml(item.definition)}</td><td>${escapeHtml(item.contextSentence)}</td></tr>`
  ).join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>English Vocab Builder</title>
  <style>
    body { font-family: sans-serif; margin: 24px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; vertical-align: top; }
    th { background-color: #f4f4f4; }
  </style>
</head>
<body>
  <h1>English Vocab Builder</h1>
  <table>
    <thead>
      <tr><th>Word</th><th>English Definition</th><th>Example Sentence</th></tr>
    </thead>
    <tbody>
${rows}
    </tbody>
  </table>
</body>
</html>
`;
  download(`vocab-${fileDate()}.html`, html, 'text/html');
}

async function exportCsv() {
  const vocabList = await Store.getVocab();
  const quote = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const lines = [
    ['word', 'definition', 'sentence', 'dateAdded'],
    ...vocabList.map(item => [item.word, item.definition, item.contextSentence, item.dateAdded])
  ].map(fields => fields.map(quote).join(','));

  // BOM: so Excel displays accented characters correctly
  download(`vocab-${fileDate()}.csv`, '\uFEFF' + lines.join('\r\n'), 'text/csv');
}

function download(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type: `${type};charset=utf-8` }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// Backup / restore: all data (including box levels and quiz history) in a single JSON file
function showStatus(message, isError = false) {
  const status = document.getElementById('data-status');
  status.textContent = message;
  status.className = isError ? 'error' : '';
}

async function exportBackup() {
  const [vocabList, answerHistory] = await Promise.all([Store.getVocab(), Store.getHistory()]);
  const backup = {
    app: BACKUP_APP_ID,
    backupVersion: 1,
    createdAt: new Date().toISOString(),
    vocabList,
    answerHistory
  };
  download(`vocab-backup-${fileDate()}.json`, JSON.stringify(backup, null, 2), 'application/json');
}

function startRestore() {
  // Opening a file picker can close the popup, so the extension is opened in a full tab
  if (!IS_TAB) {
    chrome.tabs.create({ url: chrome.runtime.getURL('popup.html?tab') });
    window.close();
    return;
  }
  document.getElementById('restore-file').click();
}

async function restoreBackup(event) {
  const file = event.target.files[0];
  event.target.value = ''; // Allow choosing the same file again
  if (!file) return;

  let backup;
  try {
    backup = JSON.parse(await file.text());
  } catch (error) {
    showStatus('Could not read the file: it is not a valid JSON file.', true);
    return;
  }
  if (backup?.app !== BACKUP_APP_ID || !Array.isArray(backup.vocabList)) {
    showStatus('This file is not an English Vocab Builder backup.', true);
    return;
  }

  const vocabList = backup.vocabList.filter(item => item && typeof item === 'object' && 'id' in item);
  const answerHistory = Array.isArray(backup.answerHistory) ? backup.answerHistory : [];
  const currentCount = (await Store.getVocab()).length;
  if (!confirm(`Your current ${currentCount} words will be deleted and the ${vocabList.length} words from the backup will be loaded. Continue?`)) {
    return;
  }

  await Store.replaceAll(vocabList, answerHistory);
  showStatus(`Restored ${vocabList.length} words and ${answerHistory.length} quiz records.`);
  loadTable();
  initQuiz();
  loadStats();
}

async function deleteAll() {
  const [vocabList, history] = await Promise.all([Store.getVocab(), Store.getHistory()]);
  if (vocabList.length === 0 && history.length === 0) {
    showStatus('The database is already empty.');
    return;
  }
  if (!confirm(`Delete all ${vocabList.length} words and ${history.length} quiz records? This cannot be undone. Use "Back up" first if you want to keep a copy.`)) {
    return;
  }

  await Store.clearAll();
  showStatus('All words and quiz history were deleted.');
  loadTable();
  initQuiz();
  loadStats();
}

// 2. Flashcard / quiz system
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function randomItem(array) {
  return array[Math.floor(Math.random() * array.length)];
}

// Correct answer + up to 3 unique wrong options; no question can be built without a wrong option
function makeQuestion(type, prompt, detail, answer, distractorPool) {
  const distractors = [...new Set(distractorPool)].filter(value => value && value !== answer);
  if (distractors.length === 0) return null;
  return { type, prompt, detail, answer, options: shuffle([answer, ...shuffle(distractors).slice(0, 3)]) };
}

// Type 1: given the word, pick its definition (options are other words' definitions)
function buildDefinitionQuestion(target, list) {
  if (!hasRealDefinition(target)) return null;
  return makeQuestion('definition', `What does "${target.word}" mean?`, '',
    target.definition, list.filter(hasRealDefinition).map(item => item.definition));
}

// Type 2: given the sentence with its word blanked out, pick the missing word (options are other words)
function buildClozeQuestion(target, list) {
  const blanked = blankWord(target.contextSentence, target.word);
  if (!blanked) return null;
  return makeQuestion('cloze', 'Which word fills the blank?', blanked,
    target.word, list.map(item => item.word));
}

// Type 3: given the word, pick the blanked-out sentence it belongs in
function buildSentenceQuestion(target, list) {
  const blanked = blankWord(target.contextSentence, target.word);
  if (!blanked) return null;
  return makeQuestion('sentence', `Which sentence does "${target.word}" belong in?`, '',
    blanked, list.filter(item => item !== target).map(item => blankWord(item.contextSentence, item.word)));
}

const QUESTION_BUILDERS = [buildDefinitionQuestion, buildClozeQuestion, buildSentenceQuestion];

async function initQuiz() {
  const questionEl = document.getElementById('quiz-question');
  const optionsContainer = document.getElementById('quiz-options');
  const feedback = document.getElementById('quiz-feedback');
  document.getElementById('quiz-detail').textContent = '';
  document.getElementById('quiz-next').hidden = true;
  optionsContainer.replaceChildren();
  feedback.textContent = '';
  feedback.className = '';

  // Prepare the question types that can be asked for each word
  const list = (await Store.getVocab()).filter(item => item.word);
  const askable = list
    .map(item => ({ item, questions: QUESTION_BUILDERS.map(build => build(item, list)).filter(Boolean) }))
    .filter(entry => entry.questions.length > 0);

  if (askable.length === 0) {
    questionEl.innerText = "Add at least 2 words with a definition or an example sentence to start the quiz.";
    return;
  }

  // Leitner logic: only words that are due for review are asked
  const now = Date.now();
  const due = askable.filter(entry => (entry.item.nextReview || 0) <= now);
  if (due.length === 0) {
    const nextTime = Math.min(...askable.map(entry => entry.item.nextReview));
    questionEl.innerText = `No words are due for review right now. Next review: ${new Date(nextTime).toLocaleString()}`;
    return;
  }

  // Pick a random word from the lowest box (least known) and a random question type
  const lowestBox = Math.min(...due.map(entry => entry.item.box));
  const { item, questions } = randomItem(due.filter(entry => entry.item.box === lowestBox));
  const question = randomItem(questions);

  questionEl.innerText = question.prompt;
  document.getElementById('quiz-detail').textContent = question.detail;
  question.options.forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    btn.textContent = opt;
    btn.onclick = () => handleAnswer(opt, question, item);
    optionsContainer.appendChild(btn);
  });
}

// Check the answer and lower/raise the review frequency (flashcard method)
async function handleAnswer(chosen, question, targetItem) {
  const isCorrect = chosen === question.answer;

  // Show the correct option in green and a wrong choice in red
  document.querySelectorAll('#quiz-options .option-btn').forEach(btn => {
    btn.disabled = true;
    if (btn.textContent === question.answer) btn.classList.add('correct');
    else if (btn.textContent === chosen) btn.classList.add('wrong');
  });

  const list = await Store.getVocab();
  const item = list.find(x => x.id === targetItem.id);
  if (item) {
    if (isCorrect) {
      item.correctCount++;
      item.box = Math.min(item.box + 1, 5); // Each correct answer moves the word up a box, so it's asked less often
    } else {
      item.wrongCount++;
      item.box = 1; // A wrong answer sends it back to the first box (asked more often)
    }
    item.nextReview = Date.now() + BOX_INTERVAL_DAYS[item.box] * DAY_MS;
  }

  await Store.saveVocab(list);
  await Store.addHistory({
    time: Date.now(),
    wordId: targetItem.id,
    word: targetItem.word,
    type: question.type,
    correct: isCorrect
  });

  const feedback = document.getElementById('quiz-feedback');
  feedback.textContent = isCorrect ? "Well done! Correct answer." : "Wrong answer!";
  feedback.className = isCorrect ? 'correct' : 'wrong';
  document.getElementById('quiz-next').hidden = false;
  loadStats();
}

// 3. Performance history
function formatRate(correct, wrong) {
  const total = correct + wrong;
  return `${total > 0 ? Math.round((correct / total) * 100) : 0}%`;
}

async function loadStats() {
  const [vocabList, history] = await Promise.all([Store.getVocab(), Store.getHistory()]);

  let totalCorrect = 0;
  let totalWrong = 0;
  vocabList.forEach(item => {
    totalCorrect += item.correctCount || 0;
    totalWrong += item.wrongCount || 0;
  });

  document.getElementById('stat-correct').innerText = totalCorrect;
  document.getElementById('stat-wrong').innerText = totalWrong;
  document.getElementById('stat-rate').innerText = formatRate(totalCorrect, totalWrong);

  // Wrongly answered words: most missed at the top
  const missed = vocabList
    .filter(item => item.wrongCount > 0)
    .sort((a, b) => b.wrongCount - a.wrongCount || a.box - b.box);
  document.getElementById('missed-empty').hidden = missed.length > 0;
  document.getElementById('missed-body').replaceChildren(
    ...missed.map(item => row(cell(item.word, true), cell(item.wrongCount), cell(item.correctCount), cell(item.box)))
  );

  // Daily history: newest day at the top
  const days = new Map();
  [...history].reverse().forEach(record => {
    const day = new Date(record.time).toLocaleDateString();
    if (!days.has(day)) days.set(day, { correct: 0, wrong: 0 });
    days.get(day)[record.correct ? 'correct' : 'wrong']++;
  });
  const recentDays = [...days].slice(0, HISTORY_DAYS_SHOWN);
  document.getElementById('history-empty').hidden = recentDays.length > 0;
  document.getElementById('history-body').replaceChildren(
    ...recentDays.map(([day, { correct, wrong }]) => row(cell(day), cell(correct), cell(wrong), cell(formatRate(correct, wrong))))
  );
}
