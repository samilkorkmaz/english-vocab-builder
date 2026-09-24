# English Vocab Builder

A Chrome extension for learning the English words you run into while browsing. Select a word, right-click, and it's saved with its English definition and the sentence you found it in. Later, the extension quizzes you with flashcards and uses spaced repetition so you review the words you don't know yet more often.

Original idea blogpost from 2007: [İngilizce Yazılım Projesi](https://samilkorkmaz.blogspot.com/2007/11/ingilizce-yazlm-projesi.html)

## Installation

The extension isn't on the Chrome Web Store yet, so it's installed from the source folder:

1. Download or clone this repository.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (top-right corner).
4. Click **Load unpacked** and select the project folder.

It also works in other Chromium-based browsers, such as Edge and Brave, through their own extensions page.

After changing the code, click the reload button on the extension's card in `chrome://extensions`.

## Usage

1. Select a word on any web page.
2. Right-click and choose **Add to Vocabulary**.
3. Click the extension's icon in the toolbar to open it. It has three tabs:
   - **Database:** your saved words, plus the export, backup and delete buttons.
   - **Quiz:** flashcard questions for the words that are due for review. The quiz needs at least two words with a definition or example sentence.
   - **Performance:** your statistics and history.

To restore a backup, click **Restore** in the popup. The extension opens in a full browser tab. Click **Restore** again there and choose the backup file. Restoring replaces all current data.

## Features

- **One-click saving.** Select a word, right-click, and choose **Add to Vocabulary**.
  - The definition is looked up automatically from [Wiktionary](https://en.wiktionary.org). If Wiktionary can't be reached, [dictionaryapi.dev](https://dictionaryapi.dev) is used instead.
  - The sentence around the word is taken from the page and saved as the example sentence.
  - If you select several words, they're saved as an example sentence for the most recently added word that appears in them.
  - Adding a word that's already saved doesn't create a duplicate. It only fills in a missing sentence or definition.
  - The extension icon briefly shows a green ✓ when a word is saved, or a red ! if something went wrong.
- **A three-column word list:** word, English definition and example sentence.
- **Flashcard quiz** with three question types:
  1. Given a word, pick its definition.
  2. Given a sentence with a word blanked out, pick the missing word.
  3. Given a word, pick the blanked-out sentence it belongs in.
- **Spaced repetition** based on the [Leitner system](https://en.wikipedia.org/wiki/Leitner_system). A correct answer moves a word up a box, and a wrong answer sends it back to box 1.

  | Box | Next review |
  |---|---|
  | 1 | Immediately |
  | 2 | After 1 day |
  | 3 | After 3 days |
  | 4 | After 7 days |
  | 5 | After 14 days |

- **Performance tracking:** total correct and wrong answers, accuracy, a list of the words you've missed most, and a day-by-day history for the last 14 days.
- **Export and backup:**
  - **Download HTML:** your word list as a standalone web page.
  - **Download CSV:** opens in Excel or Google Sheets, or imports into Anki.
  - **Back up / Restore:** saves everything, including quiz progress and history, to a JSON file and loads it back.
  - **Delete all:** clears every word and the quiz history, after asking for confirmation.

## Privacy

- All data is stored locally in your browser (`chrome.storage.local`). Nothing is sent to a server of this project, and there's no account or sync.
- When you add a word, only that word is sent to Wiktionary (or dictionaryapi.dev) to look up its definition.
- The extension reads a page only at the moment you click **Add to Vocabulary**, to get the sentence around your selection. It doesn't run on pages otherwise.

Removing the extension deletes your data. Use **Back up** first if you want to keep it.

### Permissions

| Permission | Why it's needed |
|---|---|
| `contextMenus` | Adds **Add to Vocabulary** to the right-click menu |
| `storage` | Saves your words, quiz progress and history |
| `activeTab` | Gives access to the current page when you click the menu item |
| `scripting` | Reads the sentence around your selection on that page |

## Known limitations

- **Menu position:** Chrome always puts extension items in their own section of the right-click menu. Extensions can't make an item the first entry.
- **No mobile support:** Chrome on iOS and Android doesn't run extensions.
- **Sentence detection** splits on `.`, `!` and `?`, so abbreviations like "Mr." can cut a sentence short. No sentence is saved on pages where scripts can't run, such as `chrome://` pages, the Chrome Web Store and some PDFs.
- **Inflected forms:** words are saved in the form you selected. Selecting "running" saves Wiktionary's entry for "running" ("present participle and gerund of run"), and the quiz blanks out only that exact form.

## Project structure

| File | Purpose |
|---|---|
| `manifest.json` | Extension configuration (Manifest V3) |
| `background.js` | Service worker: right-click menu, dictionary lookups, sentence capture, saving words |
| `common.js` | Shared by the background script and the popup: storage access, placeholder texts, word-blanking helper |
| `popup.html` | Popup layout and styles |
| `popup.js` | Popup logic: word table, export, backup/restore, quiz, statistics |
