// The words dek.pub's pages say, in English and Japanese. A page picks its language from
// `?lang=`, then the `lang` cookie, then Accept-Language; a talk's own text keeps its own language.
// Labels for values an agent also reads (visibility, role, comment status) keep the `--json` names
// as their keys, so the UI and `dekc pub … --json` say the same thing.

const LANGS = ["en", "ja"] as const;
export type Lang = (typeof LANGS)[number];

const en = {
  "site.name": "dek.pub",
  "site.tagline": "Publish talks you can read.",
  "site.description":
    "dek.pub publishes talks built with dek: the slides play at the top, and the script reads below like an essay.",
  "nav.skip": "Skip to content",
  "nav.signin": "Sign in",
  "nav.signout": "Sign out",
  "nav.profile": "Your talks",
  "nav.account": "Account menu",
  "nav.signedInAs": "Signed in as",
  "lang.label": "Language",
  "theme.label": "Theme",
  "theme.system": "System",
  "theme.light": "Light",
  "theme.dark": "Dark",
  "footer.builtWith": "Built with dek",
  "footer.docs": "dek docs",
  "footer.source": "Source",
  "footer.terms": "Terms",
  "footer.privacy": "Privacy",

  "common.copy": "Copy",
  "common.copied": "Copied",
  "common.cancel": "Cancel",
  "common.close": "Close",
  "common.save": "Save",
  "common.retry": "Try again",
  "common.loading": "Loading…",
  "common.slides": "{n} slides",
  "common.slide": "1 slide",
  "common.error": "Something went wrong. {message}",
  "common.offline": "Couldn’t reach dek.pub. Check your connection and try again.",

  "landing.title": "Talks that read as well as they play",
  "landing.sub":
    "Write the script first in dek, then publish the deck and its script to one URL. Readers get the slides and the essay; you get comments your agent can act on.",
  "landing.command": "Publish from your terminal",
  "landing.ctaSignin": "Sign in with GitHub",
  "landing.ctaSample": "See a sample talk",
  "landing.ctaProfile": "Go to your talks",
  "landing.f1.title": "The deck, as you built it",
  "landing.f1.body":
    "Every slide plays in the browser from its own isolated origin, with your fonts, motion and beats. Link straight to any slide by its slug.",
  "landing.f2.title": "The script, as an article",
  "landing.f2.body":
    "Below the slides, the talk reads like a well-set essay: one heading and picture per slide, then what you say. Stage directions never leave your machine.",
  "landing.f3.title": "Comments your agent reads",
  "landing.f3.body":
    "Reviewers select a sentence or point at part of a slide. The same notes come back to you as data, in the shape dek’s own annotations use.",
  "landing.recent": "Recent talks",
  "landing.recentEmpty": "No public talks yet. Yours could be the first.",
  "landing.how": "How it works",
  "landing.step1": "Sign in once from the CLI.",
  "landing.step2": "Publish. A new talk is private until you share it.",
  "landing.step3": "Share a link, or make it public with its script.",

  "signin.title": "Sign in to dek.pub",
  "signin.github": "Continue with GitHub",
  "signin.note": "We read your public GitHub profile. We never post to GitHub.",
  "signin.devTitle": "Development sign-in",
  "signin.devNote":
    "This server runs with DEK_PUB_DEV_LOGIN=1, so an email and password stand in for GitHub. Never on the deployed app.",
  "signin.name": "Name",
  "signin.email": "Email",
  "signin.password": "Password",
  "signin.create": "Create account",
  "signin.submit": "Sign in",
  "signin.toCreate": "New here? Create a development account",
  "signin.toSignin": "Have an account? Sign in",
  "signin.failed": "That didn’t work: {message}",
  "signin.already": "You’re signed in as @{handle}.",
  "signin.continue": "Continue",
  "signin.or": "or",
  "signin.linkLabel": "Email address",
  "signin.linkSubmit": "Email me a sign-in link",
  "signin.linkNote":
    "For an address a talk was shared with, or one you have signed in with before.",
  "signin.linkSent": "If {email} may sign in, a link is on its way. It works once, for 15 minutes.",
  "signin.linkAgain": "Use another address",
  "signin.linkFailed": "That link has expired or was used already. Ask for a new one.",

  "device.title": "Connect dekc",
  "device.prompt": "Enter the code shown in your terminal.",
  "device.codeLabel": "Device code",
  "device.continue": "Continue",
  "device.signedOut": "Sign in to connect dekc to your account. You’ll come back here after.",
  "device.confirm": "Allow dekc to publish as @{handle}?",
  "device.confirmBody": "dekc on your computer will be able to:",
  "device.scope.publish": "Publish talks and new versions to your account",
  "device.scope.share": "Change who can see your talks",
  "device.scope.comments": "Read and resolve comments on your talks",
  "device.code": "Code {code}",
  "device.allow": "Allow",
  "device.deny": "Cancel",
  "device.done": "dekc is connected. You can close this tab.",
  "device.doneHint": "Go back to your terminal; dekc is signed in.",
  "device.denied": "Connection cancelled. dekc was not given access.",
  "device.deniedHint": "Run `dekc pub login` again whenever you’re ready.",
  "device.invalid": "That code isn’t right. Check it against your terminal and try again.",
  "device.expired": "This code has expired. Run `dekc pub login` again.",
  "device.used": "This code was already used. Run `dekc pub login` again for a new one.",
  "device.short": "The code has 8 characters.",
  "device.startOver": "Enter another code",

  "profile.talks": "Talks",
  "profile.rss": "RSS",
  "profile.empty": "No public talks yet.",
  "profile.emptyOwner": "No talks yet. Publish one from a dek project:",
  "profile.howPublishing": "How publishing works",
  "profile.ownerNote": "Only you see your private and link-only talks here.",

  "visibility.label": "Visibility",
  "visibility.private": "Private",
  "visibility.link": "Link only",
  "visibility.public": "Public",
  "visibility.private.hint": "Only you and the people you share it with can open it.",
  "visibility.link.hint": "Anyone with the link can view. It isn’t listed or indexed.",
  "visibility.public.hint": "Anyone can find it on your profile and in RSS.",
  "visibility.confirmTitle": "Make “{title}” public?",
  "visibility.confirmBody":
    "It will be listed on your profile and in RSS, and search engines may index it.",
  "visibility.confirm": "Make public",

  "talk.by": "by {name}",
  "talk.prev": "Previous slide",
  "talk.next": "Next slide",
  "talk.position": "Slide {n} of {total}",
  "talk.fullscreen": "Fullscreen",
  "talk.exitFullscreen": "Leave full screen",
  "talk.review": "Review in full screen",
  "talk.thisSlide": "This slide",
  "side.slides": "Slides",
  "side.details": "About this talk",
  "side.author": "Speaker",
  "side.date": "Date",
  "side.version": "Version",
  "side.length": "Length",
  "side.review": "Review",
  "side.openThreads": "{n} open threads",
  "side.openThread": "1 open thread",
  "side.openReview": "Open the review",
  "talk.allSlides": "All slides",
  "talk.copySlideLink": "Copy link to slide",
  "talk.linkCopied": "Link to this slide copied.",
  "talk.read": "Read the script",
  "talk.viewerTitle": "Slides of “{title}”",
  "talk.viewerOffline":
    "The slides couldn’t be controlled from this page; use the keys inside the deck.",
  "talk.manage": "Manage",
  "talk.share": "Share",
  "talk.shareCopied": "Link to the talk copied.",
  "talk.comments": "Review",
  "talk.script": "Script",
  "talk.scriptHidden": "The speaker has not published the script.",
  "talk.scriptOwner": "Only you see the script. Publish it from Manage.",
  "talk.slideLabel": "Slide {n}",
  "talk.showSlide": "Show slide {n} in the viewer",
  "talk.jumpToSlide": "Jump to slide {n}",
  "talk.zoomSlide": "Enlarge slide {n}",
  "talk.closeZoom": "Close",
  "talk.noPicture": "No picture of this slide",
  "talk.version": "v{n}",
  "talk.moreBy": "More talks by {name}",
  "talk.commentSlide": "Comment on this slide",

  "comment.placeholder": "Add a comment…",
  "comment.replyPlaceholder": "Reply…",
  "comment.empty": "No comments yet.",
  "comment.emptyHint": "Select a sentence or tap a part of a slide to comment.",
  "comment.guest": "Comment as a guest",
  "comment.guestName": "Your name",
  "comment.guestBadge": "Guest",
  "comment.signin": "Sign in",
  "comment.signinToComment": "Sign in to comment",
  "comment.post": "Comment",
  "comment.reply": "Reply",
  "comment.resolve": "Resolve",
  "comment.reopen": "Reopen",
  "comment.resolvedBy": "Resolved",
  "comment.moved": "Moved",
  "comment.movedHint": "Its slide was renamed or moved since.",
  "comment.detached": "This part changed since v{n}.",
  "comment.detachedBadge": "Changed",
  "comment.onSelection": "Comment on selection",
  "comment.onSlide": "Comment on this slide",
  "comment.pickHint": "Click a part of the slide",
  "comment.pickHintTouch": "Tap a part of the slide",
  "comment.pickUnavailable":
    "This deck can’t be pointed at. Select a sentence of the script instead.",
  "comment.cancelPick": "Cancel",
  "comment.newOn": "New comment",
  "comment.notSent": "Not sent.",
  "comment.sending": "Sending…",
  "comment.moreReplies": "{n} more replies",
  "comment.filter": "Show",
  "comment.filter.open": "Open",
  "comment.filter.resolved": "Resolved",
  "comment.filter.all": "All",
  "comment.count": "{n} comments",
  "comment.slideChip": "Slide {n} · {name}",
  "comment.copyLink": "Copy link",
  "comment.linkCopied": "Link to the comment copied.",
  "comment.close": "Close comments",
  "comment.shortcut": "⌘↵ to send",
  "comment.closed": "Comments are off for this talk.",
  "comment.version": "On v{n}",
  "comment.expand": "Show more of the comments",
  "comment.collapse": "Show less of the comments",
  "comment.quotedScript": "Quoted the script",
  "comment.pin": "Comment {n}",
  "comment.scope": "Who reads it",
  "comment.scope.team": "Team only",
  "comment.scope.shared": "Client too",
  "comment.teamOnly": "Team only",
  "comment.widen": "Show to client",
  "comment.widened": "Shared with the client.",
  "comment.mail": "Email me about these comments",
  "talk.versionPick": "Version",
  "public.title": "Comments",
  "public.empty": "No comments yet.",
  "public.off": "Comments are off for this talk.",
  "public.signin": "Sign in to comment",
  "public.placeholder": "Add a comment…",
  "public.replyPlaceholder": "Reply…",
  "public.reply": "Reply",
  "public.edit": "Edit",
  "public.save": "Save",
  "public.delete": "Delete",
  "public.deleteSure": "Delete it and its replies?",
  "public.edited": "edited",
  "like.label": "Like",
  "like.signin": "Sign in to like",
  "talk.versionCurrent": "v{n} · current",
  "talk.versionDraft": "v{n} · draft",
  "talk.versionOlder": "v{n}",
  "talk.draft": "Draft: version {n}. The client’s side reads version {current}.",
  "talk.draftNone":
    "Draft: version {n}. No version is current, so the client’s side sees nothing yet.",
  "talk.older": "Version {n}, older than the current version {current}.",
  "comment.muted": "You won’t get email about this talk’s comments.",
  "comment.unmuted": "You’ll get email about threads you’re in.",
  "comment.selectionKeys": "Press {keys} to comment on the selected words.",
  "device.fromLink": "This code came with the link you opened.",
  "device.fromLinkBody":
    "Only continue if you just ran `dekc pub login` yourself and your terminal shows this same code. Someone who sends you a link like this could otherwise publish as you.",
  "device.matches": "My terminal shows {code}",
  "device.mustMatch": "Check that your terminal shows this code first.",
  "device.confirmWarning": "If you did not start this from your own terminal just now, cancel.",

  "manage.title": "Manage “{title}”",
  "manage.back": "Back to the talk",
  "manage.overview": "Overview",
  "manage.openTalk": "Open talk",
  "manage.url": "Talk URL",
  "manage.script": "Script",
  "manage.script.toggle": "Publish the script with the slides",
  "manage.script.hint":
    "Readers see what you say under each slide. Stage directions are never published.",
  "manage.embed": "Embedding",
  "manage.embed.toggle": "Allow other sites to embed the slides",
  "manage.embed.hint": "Only for public talks. Other sites can show the deck in an iframe.",
  "manage.comments": "Comments",
  "manage.comments.off": "Off",
  "manage.comments.signed-in": "Signed in",
  "manage.comments.guests": "Guests too",
  "manage.comments.off.hint":
    "No one can comment below the talk. Review threads are for the people you share it with, whatever this says.",
  "manage.comments.signed-in.hint":
    "Anyone who can open the talk and is signed in can comment below it. Review threads are for the people you share it with.",
  "manage.comments.guests.hint":
    "Guests can comment below the talk too, with a name, after a human check.",
  "manage.sharing": "Sharing",
  "manage.sharing.hint":
    "Invite people by dek.pub handle, or by email before they have an account.",
  "manage.sharing.who": "Handle or email",
  "manage.sharing.placeholder": "@handle or name@example.com",
  "manage.sharing.add": "Add",
  "manage.sharing.empty": "Not shared with anyone yet.",
  "manage.sharing.remove": "Remove {who}",
  "manage.sharing.removed": "Removed {who}.",
  "manage.sharing.added": "Shared with {who}.",
  "manage.sharing.anyone": "Anyone with the link can view.",
  "manage.sharing.pending": "Invited by email",
  "role.label": "Role",
  "role.view": "Can view",
  "role.comment": "Can comment",
  "side.label": "Side",
  "side.team": "Team",
  "side.client": "Client",
  "manage.sharing.sideHint":
    "Team members read every thread; clients read only those shared with them.",
  "manage.versions": "Versions",
  "manage.versions.hint": "Each publish is a new version. Readers see the current one.",
  "manage.versions.current": "Current",
  "manage.versions.makeCurrent": "Make current",
  "manage.versions.view": "View",
  "manage.versions.published": "Published {date}",
  "manage.versions.changed": "{n} slides changed",
  "manage.versions.changedOne": "1 slide changed",
  "manage.versions.lint": "{errors} errors · {warnings} warnings",
  "manage.versions.dek": "dek {version}",
  "manage.versions.noMessage": "No message",
  "rollback.title": "Roll back to v{n}?",
  "rollback.body": "Readers will see v{n} right away. v{current} stays in the list.",
  "rollback.confirm": "Make v{n} current",
  "rollback.done": "v{n} is current.",
  saved: "Saved.",
  undo: "Undo",

  "404.title": "This talk isn’t here",
  "404.body": "The link may be wrong, or the talk may be private.",
  "404.home": "Go to dek.pub",
  "404.signin": "Sign in",
  "500.title": "Something went wrong on our side",
  "500.body": "Try again in a moment.",

  "time.justNow": "just now",
} as const;

export type MessageKey = keyof typeof en;

const ja: Record<MessageKey, string> = {
  "site.name": "dek.pub",
  "site.tagline": "読めるトークを公開する。",
  "site.description":
    "dek.pub は dek で作ったトークを公開する場所です。上でスライドが動き、下で台本が記事として読めます。",
  "nav.skip": "本文へ移動",
  "nav.signin": "サインイン",
  "nav.signout": "サインアウト",
  "nav.profile": "自分のトーク",
  "nav.account": "アカウントメニュー",
  "nav.signedInAs": "サインイン中",
  "lang.label": "言語",
  "theme.label": "テーマ",
  "theme.system": "システム",
  "theme.light": "ライト",
  "theme.dark": "ダーク",
  "footer.builtWith": "dek で作られています",
  "footer.docs": "dek ドキュメント",
  "footer.source": "ソース",
  "footer.terms": "利用規約",
  "footer.privacy": "プライバシー",

  "common.copy": "コピー",
  "common.copied": "コピーしました",
  "common.cancel": "キャンセル",
  "common.close": "閉じる",
  "common.save": "保存",
  "common.retry": "再試行",
  "common.loading": "読み込み中…",
  "common.slides": "{n} 枚",
  "common.slide": "1 枚",
  "common.error": "うまくいきませんでした。{message}",
  "common.offline": "dek.pub に接続できませんでした。接続を確かめて、もう一度お試しください。",

  "landing.title": "動かしても、読んでも伝わるトークを",
  "landing.sub":
    "dek で台本を先に書き、スライドと台本を 1 つの URL に公開します。読む人にはスライドと記事が、あなたにはエージェントが扱えるコメントが届きます。",
  "landing.command": "ターミナルから公開",
  "landing.ctaSignin": "GitHub でサインイン",
  "landing.ctaSample": "サンプルのトークを見る",
  "landing.ctaProfile": "自分のトークへ",
  "landing.f1.title": "作ったままのスライド",
  "landing.f1.body":
    "スライドは独立したオリジンからブラウザで再生され、フォントも動きもビートもそのままです。slug で任意のスライドにリンクできます。",
  "landing.f2.title": "記事として読める台本",
  "landing.f2.body":
    "スライドの下に、1 枚ごとの見出しと画像、話す言葉が整った記事として並びます。ト書きは手元から出ません。",
  "landing.f3.title": "エージェントが読むコメント",
  "landing.f3.body":
    "レビュアーは文を選ぶか、スライドの一部を指してコメントします。同じメモが、dek の annotations と同じ形のデータで手元に戻ります。",
  "landing.recent": "新着のトーク",
  "landing.recentEmpty": "公開されたトークはまだありません。最初の 1 本をどうぞ。",
  "landing.how": "使い方",
  "landing.step1": "CLI から一度サインインします。",
  "landing.step2": "公開します。新しいトークは共有するまで非公開です。",
  "landing.step3": "リンクを共有するか、台本ごと全体に公開します。",

  "signin.title": "dek.pub にサインイン",
  "signin.github": "GitHub で続ける",
  "signin.note": "GitHub の公開プロフィールを読み取ります。GitHub に投稿することはありません。",
  "signin.devTitle": "開発用サインイン",
  "signin.devNote":
    "このサーバーは DEK_PUB_DEV_LOGIN=1 で動いているため、メールとパスワードで GitHub の代わりにサインインできます。本番では使えません。",
  "signin.name": "名前",
  "signin.email": "メールアドレス",
  "signin.password": "パスワード",
  "signin.create": "アカウントを作る",
  "signin.submit": "サインイン",
  "signin.toCreate": "初めての方は開発用アカウントを作成",
  "signin.toSignin": "アカウントをお持ちの方はサインイン",
  "signin.failed": "サインインできませんでした: {message}",
  "signin.already": "@{handle} としてサインインしています。",
  "signin.continue": "続ける",
  "signin.or": "または",
  "signin.linkLabel": "メールアドレス",
  "signin.linkSubmit": "サインイン用のリンクをメールで受け取る",
  "signin.linkNote":
    "トークを共有されたアドレスか、前にサインインしたことのあるアドレスで使えます。",
  "signin.linkSent":
    "{email} でサインインできる場合は、リンクを送りました。15 分の間、一度だけ使えます。",
  "signin.linkAgain": "別のアドレスにする",
  "signin.linkFailed":
    "リンクの期限が切れたか、すでに使われています。新しいリンクを受け取ってください。",

  "device.title": "dekc を接続",
  "device.prompt": "ターミナルに表示されたコードを入力してください。",
  "device.codeLabel": "デバイスコード",
  "device.continue": "続ける",
  "device.signedOut":
    "dekc をアカウントに接続するには、サインインしてください。終わるとこのページに戻ります。",
  "device.confirm": "dekc に @{handle} として公開を許可しますか？",
  "device.confirmBody": "お使いのコンピューターの dekc が次のことをできるようになります。",
  "device.scope.publish": "トークと新しい版をアカウントに公開する",
  "device.scope.share": "トークの公開範囲を変える",
  "device.scope.comments": "トークへのコメントを読み、解決にする",
  "device.code": "コード {code}",
  "device.allow": "許可する",
  "device.deny": "キャンセル",
  "device.done": "dekc を接続しました。このタブは閉じてかまいません。",
  "device.doneHint": "ターミナルに戻ってください。dekc はサインイン済みです。",
  "device.denied": "接続をキャンセルしました。dekc にアクセスは与えていません。",
  "device.deniedHint": "準備ができたら、もう一度 `dekc pub login` を実行してください。",
  "device.invalid":
    "コードが正しくありません。ターミナルの表示と見比べて、もう一度入力してください。",
  "device.expired": "コードの有効期限が切れました。もう一度 `dekc pub login` を実行してください。",
  "device.used":
    "このコードは使用済みです。もう一度 `dekc pub login` を実行して、新しいコードを出してください。",
  "device.short": "コードは 8 文字です。",
  "device.startOver": "別のコードを入力",

  "profile.talks": "トーク",
  "profile.rss": "RSS",
  "profile.empty": "公開されたトークはまだありません。",
  "profile.emptyOwner": "トークはまだありません。dek のプロジェクトから公開できます。",
  "profile.howPublishing": "公開のしくみ",
  "profile.ownerNote": "非公開とリンク限定のトークは、ここではあなたにだけ表示されます。",

  "visibility.label": "公開範囲",
  "visibility.private": "非公開",
  "visibility.link": "リンクを知っている人のみ",
  "visibility.public": "公開",
  "visibility.private.hint": "あなたと、共有した人だけが開けます。",
  "visibility.link.hint": "リンクを知っている人は誰でも見られます。一覧や検索には出ません。",
  "visibility.public.hint": "プロフィールと RSS に表示され、誰でも見られます。",
  "visibility.confirmTitle": "「{title}」を公開しますか？",
  "visibility.confirmBody": "プロフィールと RSS に載り、検索エンジンに登録されることがあります。",
  "visibility.confirm": "公開する",

  "talk.by": "{name}",
  "talk.prev": "前のスライド",
  "talk.next": "次のスライド",
  "talk.position": "{total} 枚中 {n} 枚目",
  "talk.fullscreen": "全画面",
  "talk.exitFullscreen": "全画面を終える",
  "talk.review": "全画面でレビュー",
  "talk.thisSlide": "このスライド",
  "side.slides": "スライド",
  "side.details": "このトークについて",
  "side.author": "話す人",
  "side.date": "日付",
  "side.version": "版",
  "side.length": "長さ",
  "side.review": "レビュー",
  "side.openThreads": "未解決のスレッド {n} 件",
  "side.openThread": "未解決のスレッド 1 件",
  "side.openReview": "レビューを開く",
  "talk.allSlides": "すべてのスライド",
  "talk.copySlideLink": "スライドへのリンクをコピー",
  "talk.linkCopied": "このスライドへのリンクをコピーしました。",
  "talk.read": "台本を読む",
  "talk.viewerTitle": "「{title}」のスライド",
  "talk.viewerOffline":
    "このページからはスライドを操作できません。デッキの中でキーを使ってください。",
  "talk.manage": "管理",
  "talk.share": "共有",
  "talk.shareCopied": "トークへのリンクをコピーしました。",
  "talk.comments": "レビュー",
  "talk.script": "台本",
  "talk.scriptHidden": "登壇者は台本を公開していません。",
  "talk.scriptOwner": "台本はあなたにだけ表示されています。「管理」から公開できます。",
  "talk.slideLabel": "スライド {n}",
  "talk.showSlide": "スライド {n} をビューアに表示",
  "talk.jumpToSlide": "スライド {n} へ移動",
  "talk.zoomSlide": "スライド {n} を拡大",
  "talk.closeZoom": "閉じる",
  "talk.noPicture": "このスライドの画像はありません",
  "talk.version": "v{n}",
  "talk.moreBy": "{name} のほかのトーク",
  "talk.commentSlide": "このスライドにコメント",

  "comment.placeholder": "コメントを追加…",
  "comment.replyPlaceholder": "返信…",
  "comment.empty": "まだコメントはありません。",
  "comment.emptyHint": "文を選ぶか、スライドの一部をタップしてコメントできます。",
  "comment.guest": "ゲストとしてコメント",
  "comment.guestName": "お名前",
  "comment.guestBadge": "ゲスト",
  "comment.signin": "サインイン",
  "comment.signinToComment": "サインインしてコメント",
  "comment.post": "コメント",
  "comment.reply": "返信",
  "comment.resolve": "解決にする",
  "comment.reopen": "再開する",
  "comment.resolvedBy": "解決済み",
  "comment.moved": "移動",
  "comment.movedHint": "スライドの名前か位置が変わりました。",
  "comment.detached": "v{n} からこの部分が変わりました。",
  "comment.detachedBadge": "変更あり",
  "comment.onSelection": "選んだ文にコメント",
  "comment.onSlide": "このスライドにコメント",
  "comment.pickHint": "スライドの一部をクリックしてください",
  "comment.pickHintTouch": "スライドの一部をタップしてください",
  "comment.pickUnavailable": "このデッキは要素を指せません。台本の文を選んでコメントしてください。",
  "comment.cancelPick": "キャンセル",
  "comment.newOn": "新しいコメント",
  "comment.notSent": "送信できませんでした。",
  "comment.sending": "送信中…",
  "comment.moreReplies": "ほか {n} 件の返信",
  "comment.filter": "表示",
  "comment.filter.open": "未解決",
  "comment.filter.resolved": "解決済み",
  "comment.filter.all": "すべて",
  "comment.count": "{n} 件のコメント",
  "comment.slideChip": "スライド {n} · {name}",
  "comment.copyLink": "リンクをコピー",
  "comment.linkCopied": "コメントへのリンクをコピーしました。",
  "comment.close": "コメントを閉じる",
  "comment.shortcut": "⌘↵ で送信",
  "comment.closed": "このトークではコメントを受け付けていません。",
  "comment.version": "v{n} へのコメント",
  "comment.expand": "コメントを広げて表示",
  "comment.collapse": "コメントを狭めて表示",
  "comment.quotedScript": "台本を引用したコメント",
  "comment.pin": "コメント {n}",
  "comment.scope": "読む人",
  "comment.scope.team": "チームのみ",
  "comment.scope.shared": "クライアントにも",
  "comment.teamOnly": "チームのみ",
  "comment.widen": "クライアントに見せる",
  "comment.widened": "クライアントと共有しました。",
  "comment.mail": "このトークのコメントをメールで受け取る",
  "talk.versionPick": "版",
  "public.title": "コメント",
  "public.empty": "まだコメントはありません。",
  "public.off": "このトークではコメントを受け付けていません。",
  "public.signin": "サインインしてコメント",
  "public.placeholder": "コメントを書く…",
  "public.replyPlaceholder": "返信する…",
  "public.reply": "返信",
  "public.edit": "編集",
  "public.save": "保存",
  "public.delete": "削除",
  "public.deleteSure": "返信ごと削除しますか？",
  "public.edited": "編集済み",
  "like.label": "いいね",
  "like.signin": "サインインしていいね",
  "talk.versionCurrent": "v{n}・公開版",
  "talk.versionDraft": "v{n}・ドラフト",
  "talk.versionOlder": "v{n}",
  "talk.draft": "ドラフト: 版 {n}。クライアント側には版 {current} が見えています。",
  "talk.draftNone":
    "ドラフト: 版 {n}。公開版がまだないため、クライアント側には何も見えていません。",
  "talk.older": "版 {n}。公開版の {current} より前の版です。",
  "comment.muted": "このトークのコメントのメールを止めました。",
  "comment.unmuted": "参加しているスレッドのメールが届きます。",
  "comment.selectionKeys": "{keys} で選んだ文にコメントできます。",
  "device.fromLink": "このコードは、開いたリンクに含まれていたものです。",
  "device.fromLinkBody":
    "たった今あなた自身が `dekc pub login` を実行し、ターミナルに同じコードが表示されている場合だけ続けてください。そうでなければ、このリンクを送った人があなたとして公開できてしまいます。",
  "device.matches": "ターミナルに {code} と表示されている",
  "device.mustMatch": "先に、ターミナルにこのコードが表示されていることを確かめてください。",
  "device.confirmWarning":
    "たった今ご自身のターミナルから始めたのでなければ、キャンセルしてください。",

  "manage.title": "「{title}」の管理",
  "manage.back": "トークに戻る",
  "manage.overview": "概要",
  "manage.openTalk": "トークを開く",
  "manage.url": "トークの URL",
  "manage.script": "台本",
  "manage.script.toggle": "スライドと一緒に台本を公開する",
  "manage.script.hint": "読む人は、各スライドの下で話す言葉を読めます。ト書きは公開されません。",
  "manage.embed": "埋め込み",
  "manage.embed.toggle": "ほかのサイトへのスライドの埋め込みを許可する",
  "manage.embed.hint": "公開のトークだけが対象です。ほかのサイトが iframe でデッキを表示できます。",
  "manage.comments": "コメント",
  "manage.comments.off": "オフ",
  "manage.comments.signed-in": "サインイン済み",
  "manage.comments.guests": "ゲストも可",
  "manage.comments.off.hint":
    "トークの下のコメントは誰も書けません。レビューのスレッドは、この設定によらず共有した人のためのものです。",
  "manage.comments.signed-in.hint":
    "トークを開けて、サインインしている人がトークの下にコメントできます。レビューのスレッドは共有した人のためのものです。",
  "manage.comments.guests.hint":
    "ゲストも名前を入れ、人間かどうかの確認を経て、トークの下にコメントできます。",
  "manage.sharing": "共有",
  "manage.sharing.hint": "dek.pub のハンドルか、アカウント作成前ならメールアドレスで招待します。",
  "manage.sharing.who": "ハンドルまたはメール",
  "manage.sharing.placeholder": "@handle または name@example.com",
  "manage.sharing.add": "追加",
  "manage.sharing.empty": "まだ誰とも共有していません。",
  "manage.sharing.remove": "{who} を削除",
  "manage.sharing.removed": "{who} を削除しました。",
  "manage.sharing.added": "{who} と共有しました。",
  "manage.sharing.anyone": "リンクを知っている人は誰でも見られます。",
  "manage.sharing.pending": "メールで招待済み",
  "role.label": "権限",
  "role.view": "閲覧のみ",
  "role.comment": "コメント可",
  "side.label": "立場",
  "side.team": "チーム",
  "side.client": "クライアント",
  "manage.sharing.sideHint":
    "チームの人はすべてのスレッドを、クライアントは共有されたスレッドだけを読めます。",
  "manage.versions": "版",
  "manage.versions.hint": "公開するたびに新しい版になります。読む人には現在の版が表示されます。",
  "manage.versions.current": "現在の版",
  "manage.versions.makeCurrent": "現在の版にする",
  "manage.versions.view": "見る",
  "manage.versions.published": "{date} に公開",
  "manage.versions.changed": "{n} 枚が変更",
  "manage.versions.changedOne": "1 枚が変更",
  "manage.versions.lint": "エラー {errors} · 警告 {warnings}",
  "manage.versions.dek": "dek {version}",
  "manage.versions.noMessage": "メッセージなし",
  "rollback.title": "v{n} に戻しますか？",
  "rollback.body": "読者にはすぐに v{n} が表示されます。v{current} は一覧に残ります。",
  "rollback.confirm": "v{n} を現在の版にする",
  "rollback.done": "v{n} が現在の版になりました。",
  saved: "保存しました。",
  undo: "元に戻す",

  "404.title": "このトークは見つかりません",
  "404.body": "リンクが間違っているか、非公開のトークです。",
  "404.home": "dek.pub へ",
  "404.signin": "サインイン",
  "500.title": "こちら側で問題が起きました",
  "500.body": "少し待ってから、もう一度お試しください。",

  "time.justNow": "たった今",
};

const DICTIONARIES: Record<Lang, Record<MessageKey, string>> = { en, ja };

function isLang(value: unknown): value is Lang {
  return (LANGS as readonly unknown[]).includes(value);
}

/** The language a request asks for: `?lang=`, then the cookie, then the browser's list. */
export function pickLang(
  query: string | null | undefined,
  cookie: string | null | undefined,
  acceptLanguage: string | null | undefined,
): Lang {
  if (isLang(query)) {
    return query;
  }
  if (isLang(cookie)) {
    return cookie;
  }
  return fromAcceptLanguage(acceptLanguage ?? "");
}

function fromAcceptLanguage(header: string): Lang {
  const ranked = header
    .split(",")
    .map((part, index) => {
      const [tag = "", ...params] = part.trim().split(";");
      const q = params.map((param) => param.trim()).find((param) => param.startsWith("q="));
      return { tag: tag.toLowerCase(), q: q ? Number(q.slice(2)) : 1, index };
    })
    .filter((entry) => entry.tag && entry.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index);
  for (const entry of ranked) {
    const base = entry.tag.split("-")[0];
    if (isLang(base)) {
      return base;
    }
  }
  return "en";
}

export type Vars = Record<string, string | number>;

export function translate(lang: Lang, key: MessageKey, vars?: Vars): string {
  const template = DICTIONARIES[lang][key] ?? en[key];
  if (!vars) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

/** "12 slides" / "1 slide", in the page's language. */
export function slideCount(lang: Lang, n: number): string {
  return n === 1 ? translate(lang, "common.slide") : translate(lang, "common.slides", { n });
}

/** A date as the page's language writes it: "Sep 25, 2026" or "2026年9月25日". */
export function formatDate(lang: Lang, iso: string | null | undefined): string {
  if (!iso) {
    return "";
  }
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat(lang === "ja" ? "ja-JP" : "en-US", {
    year: "numeric",
    month: lang === "ja" ? "long" : "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/** "3 days ago", relative to `now`; past a month, the date. */
export function relativeTime(lang: Lang, iso: string, now: number): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) {
    return iso;
  }
  const seconds = Math.round((then - now) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 45) {
    return translate(lang, "time.justNow");
  }
  const format = new Intl.RelativeTimeFormat(lang === "ja" ? "ja-JP" : "en-US", {
    numeric: "auto",
  });
  if (abs < 3600) {
    return format.format(Math.round(seconds / 60), "minute");
  }
  if (abs < 86400) {
    return format.format(Math.round(seconds / 3600), "hour");
  }
  if (abs < 86400 * 30) {
    return format.format(Math.round(seconds / 86400), "day");
  }
  return formatDate(lang, iso);
}

/** The absolute form of a time, for a `<time>`'s title. */
export function absoluteTime(lang: Lang, iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat(lang === "ja" ? "ja-JP" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date);
}

/**
 * A text's language when nothing says: Japanese if it has kana, or kanji alone on a page that is
 * Japanese already (a title such as 「発表論」 is more likely Japanese than Chinese there).
 */
export function guessLang(texts: readonly string[], context?: Lang): string | null {
  if (texts.some((text) => /[\u3040-\u30ff]/.test(text))) {
    return "ja";
  }
  return context === "ja" && texts.some((text) => /[\u4e00-\u9fff]/.test(text)) ? "ja" : null;
}
