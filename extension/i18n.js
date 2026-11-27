// English message keys with Japanese translations.
/** @type {Record<string, string>} */
const messages = {
  "Comment display": "コメントの表示",
  "Hide comments": "非表示",
  "Show comment markers": "表示",
  "Show comment text": "本文も表示",
  "Could not load comment display settings. Reload the panel to try again.": "コメントの表示設定を読み込めませんでした。パネルを再読み込みしてください。",
  "Could not save comment display settings. Please try again.": "コメントの表示設定を保存できませんでした。もう一度お試しください。",
  "The text could not be located. The comment is still saved.": "対象箇所が見つかりません。コメント自体は保存されています。",
  "Could not display comments on this page.": "このページではコメントを表示できませんでした。",
  "Add page comment": "ページにコメントを追加",
  "Show page comments": "このページのコメントを表示",
  "Page comments": "ページコメント",
  "Page comment": "ページコメント",
  "Show comment": "コメントを表示",
  "Edit": "編集",
  "Close": "閉じる",
  "Close comments": "コメントを閉じる",
  "Comment": "コメント",
  "Save comment": "コメントを保存",
  "Delete": "削除",
  "Delete this comment?": "このコメントを削除しますか？",
  "Discard unsaved changes?": "保存していない変更を破棄しますか？",
  "Saved comments": "保存済みのコメント",
  "Export JSON": "JSONを出力",
  "No comments yet.": "コメントはまだありません。",
  "Select text on a page, then right-click to add a comment.": "ページ内の文章を選択し、右クリックからコメントを追加できます。",
  "Saved on this device. Removing the extension deletes its comments.": "この端末内に保存します。拡張を削除するとコメントも削除されます。",
  "On another visit, right-click the page and choose Show page comments.": "再訪時はページを右クリックし「このページのコメントを表示」を選んでください。",
  "A new selection is waiting. Save your current comment or discard its changes.": "新しい選択箇所が届いています。編集中のコメントを保存するか、変更を破棄してください。",
  "Open new selection": "新しい選択箇所を開く",
  "This comment changed in another window. Reopen it before saving.": "別の画面でコメントが変更されました。一覧から開き直してください。",
  "Could not save or load comments. Please try again.": "コメントを保存または読み込みできませんでした。もう一度お試しください。",
  "Comment access denied.": "このコメントにはアクセスできません。",
  "Invalid comment.": "コメントの内容が正しくありません。",
  "Invalid comment URL.": "コメントのURLが正しくありません。",
  "Unsupported page.": "このページは対象外です。",
  "Select some page text first.": "通常のページ本文を選択してください。",
  "The selected text cannot be linked reliably.": "選択箇所を一意に特定できません。範囲を少し広げて選択し直してください。",
  "This page is too large to annotate.": "このページは大きすぎるためコメントを表示できません。",
  "Comments currently support top-level HTML pages only.": "現在は通常のHTMLページの本文に対応しています。埋め込みフレーム内は対象外です。",
  "Could not access this page. Try a regular HTML page.": "ページを読み取れませんでした。通常のHTMLページでお試しください。",

  "Close options": "操作メニューを閉じる",
  "More options": "その他の操作",
  "Portal sections": "ポータルの画面",
  "Calendar · pinned": "カレンダー · ピン留め中",
  "Portal settings": "ポータルの設定",
  "Extension settings": "拡張機能の設定",
  "Selected": "選択中",
  "Import bookmarks": "ブックマークを取り込む",
  "Close import": "取り込みを閉じる",
  "Open an updated portal to import bookmarks.": "更新済みのポータルを開くと取り込めます。",
  "Add new URLs to Links. Existing entries stay unchanged.": "新しいURLだけをLinksに追加します。登録済みの内容は変更しません。",
  "Choose Chrome bookmarks": "Chromeのブックマークを選ぶ",
  "Bookmark folder": "ブックマークのフォルダ",
  "Choose a folder": "フォルダを選択",
  "Use folder names as tags": "フォルダ名をタグにする",
  "Includes subfolders. Up to 1,000 bookmarks per import.": "サブフォルダを含みます。1回につき1,000件まで取り込めます。",
  "Preview additions": "追加候補を確認",
  "Import complete": "取り込み完了",
  "Destination": "登録先",
  "Added": "追加済み",
  "New": "新規",
  "Already registered": "登録済み",
  "Unsupported or invalid": "対象外・不正な項目",
  "Add to spreadsheet": "スプレッドシートに追加",
  "Export TSV": "TSVをダウンロード",
  "Choose at most 1,000 bookmarks. Titles and folder names must fit the import limits.": "1,000件以内のフォルダを選んでください。タイトルやフォルダ名も長さの上限内にしてください。",
  "The destination changed. Preview again before importing.": "登録先が変更されました。追加候補を確認し直してください。",
  "Configure a Links spreadsheet in the portal first.": "先にポータルでLinks用スプレッドシートを設定してください。",
  "The configured sheet was not found. Check the portal settings.": "設定されたシートが見つかりません。ポータルの設定を確認してください。",
  "The sheet needs unique id, name and url column headers.": "シートには重複のないid・name・urlの列見出しが必要です。",
  "Could not read the spreadsheet. Check its access and the portal authorization.": "スプレッドシートを読み取れませんでした。アクセス権とポータルの認可を確認してください。",
  "Could not confirm the write. Preview again to check for additions. Direct import requires a spreadsheet this app can edit; you can also export TSV.": "書き込み結果を確認できませんでした。追加候補を確認し直してください。直接登録には、このアプリが編集できるシートが必要です。TSV出力も利用できます。",
  "The portal is processing another import. Try again shortly.": "ポータルは別の取り込みを処理中です。少し待って再試行してください。",
  "Could not contact the portal. Reload it and try again.": "ポータルと通信できませんでした。ポータルを再読み込みしてください。",
  "The portal did not respond. Preview again before retrying an import.": "ポータルから応答がありません。再登録する前に追加候補を確認し直してください。",
  "Bookmark access was not granted.": "ブックマークへのアクセスが許可されませんでした。",

  "Invalid page settings.": "画面の設定が正しくありません。",
  "My Portal Extension settings": "My Portal Extension 設定",
  "Reorder page": "画面を並び替え",
  "Drag to reorder, or use the Up and Down arrow keys.": "ドラッグ、または上下キーで並び替えます。",
  "Page order updated. Save to apply.": "画面の順序を変更しました。保存すると反映されます。",
  "Chrome internal pages cannot be displayed in a side panel. Open them in a browser tab.": "Chrome内部ページはサイドパネル内に表示できません。通常のブラウザタブで開いてください。",
  "Remove": "削除",
  "You can save up to 20 pages.": "画面は20件まで登録できます。",
  "Extension ID": "拡張ID",
  "Close settings": "設定を閉じる",
  "No pages yet.": "画面が登録されていません。",
  "Open settings": "設定を開く",
  "Pages": "画面",
  "Add page": "画面を追加",
  "Remove page": "画面を削除",
  "Page name": "画面名",
  "Page URL": "画面のURL",
  "Switch page": "画面を切り替え",
  "Could not open the page.": "ページを開けませんでした。",
  "Enter an HTTPS URL or a local HTTP URL (localhost or 127.0.0.1), without a username or password.": "HTTPSのURL、またはlocalhost・127.0.0.1のHTTP URLを入力してください。ユーザー名やパスワードは含められません。",
  "Could not read the saved settings. Reload the panel to try again.": "設定を読み込めませんでした。パネルを再読み込みしてお試しください。",
  "Could not save the connection. Try again.": "接続先を保存できませんでした。もう一度お試しください。",
  "Click to hide content": "クリックで暗転",
  "Double-click to show content": "ダブルクリックで表示を戻す",
  "Press Enter or Space once to hide content, twice to show it.": "Enter または Space を1回押すと暗転、2回押すと表示を戻します。",
  "Could not save visibility. Content remains hidden. Double-click to try again.": "暗転状態を保存できませんでした。内容は非表示のままです。ダブルクリックで再試行してください。",
  "Could not restore visibility. Content remains hidden. Double-click to show it.": "暗転状態を読み込めませんでした。内容は非表示のままです。ダブルクリックで表示を戻せます。",
  "Side panel controls": "サイドパネルの操作",
  "Open tab": "タブで開く",
  "Reload": "再読み込み",
  "Save and connect": "保存して接続",
  "Cancel": "キャンセル",
  "Saved": "保存しました",
  "Automatic (browser)": "自動（ブラウザの言語）",
  "Language": "表示言語",
  "Could not save the language. Please try again.": "言語を保存できませんでした。もう一度お試しください。"
};
/** @param {unknown} language @returns {'ja' | 'en'} */
const normalize = (language) => language === 'ja' ? 'ja' : 'en';
/** @param {string} key @param {string} [language] @param {Record<string, string | number>} [values] */
function t(key, language = 'en', values = {}) {
  const text = normalize(language) === 'ja' ? messages[key] ?? key : key;
  return text.replace(/\{(\w+)\}/g, (match, name) => String(values[name] ?? match));
}
/** @param {unknown} value @returns {'auto' | 'ja' | 'en'} */
const preference = (value) => value === 'ja' || value === 'en' ? value : 'auto';
/** Respect saved choices, then the browser's ordered language preferences.
 * @param {unknown} value @param {readonly string[]} [languages] @returns {'ja' | 'en'} */
function resolve(value, languages = []) {
  const selected = preference(value);
  if (selected !== 'auto') return selected;
  for (const language of languages) {
    if (/^ja(?:-|$)/i.test(language)) return 'ja';
    if (/^en(?:-|$)/i.test(language)) return 'en';
  }
  return 'en';
}

export const i18n = { normalize, preference, resolve, t };
