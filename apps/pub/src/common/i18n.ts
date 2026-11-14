// The words dek.pub's pages say, in English and Japanese. A page picks its language from
// `?lang=`, then the `lang` cookie, then Japanese; a talk's own text keeps its own language.
// Labels for values an agent also reads (visibility, role, comment status) keep the `--json` names
// as their keys, so the UI and `dekc pub … --json` say the same thing.

export const LANGS = ["en", "ja"] as const;
export type Lang = (typeof LANGS)[number];

/** The language of a page asked for with no `?lang=` and no cookie, as a crawler asks for it. */
export const DEFAULT_LANG: Lang = "ja";

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
  "footer.about": "About",
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
  "common.minutes": "{n} min",
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
    "Below the slides, the talk reads like a well-set essay: one heading and picture per slide, then what you say. Stage directions never reach readers.",
  "landing.f3.title": "Comments your agent reads",
  "landing.f3.body":
    "Reviewers select a sentence or point at part of a slide. The same notes come back to you as data, in the shape dek’s own annotations use.",
  "landing.recent": "Recent talks",
  "landing.recentEmpty": "No public talks yet. Yours could be the first.",
  "landing.how": "How it works",
  "landing.step1": "Sign in once from the CLI.",
  "landing.step2": "Publish. A new talk is for your team alone until you widen it.",
  "landing.step3": "Share a link, or make it public with its script.",

  "about.title": "About dek.pub",
  "about.description":
    "Why dek.pub exists, how much of your script reaches readers, who sees a talk, and what dek.pub won’t do.",
  "about.hero": "A talk keeps reaching people after you give it",
  "about.lead":
    "dek.pub is where talks made with dek are published. The slides and the script share one URL, so people who weren’t in the room get the talk as it was given.",
  "about.sample": "A talk on dek.pub",
  "about.why.title": "Slides alone don’t keep a talk",
  "about.why.p1":
    "When a talk is over, what usually stays behind is its slides. But slides go with what you say. Opened later without the words, they rarely tell anyone what the talk meant, and few people sit through thirty minutes of video to find the one point they came for.",
  "about.why.p2":
    "In dek you write the script first, so the words are already text. dek.pub publishes them with the slides: the deck plays as you built it, and the script reads as an article, with a heading and a picture for each slide.",
  "about.script.title": "How much of your script reaches readers",
  "about.script.p":
    "Everything you say aloud does. What you wrote for yourself doesn’t: a line you mark as a stage direction with > in script.md is taken out of the script readers get.",
  "about.script.mine": "script.md, on your machine",
  "about.script.theirs": "The article on dek.pub",
  "about.script.heading": "Why the script comes first",
  "about.script.direction": "Ask the room who starts from slides.",
  "about.script.said":
    "Slides are there to be spoken over. Yet the tools we use all start from an empty slide.",
  "about.script.note":
    "The full build and the source, stage directions included, are uploaded as well, and are never handed to readers.",
  "about.control.title": "You decide who sees it",
  "about.control.p1":
    "A new talk is for your team alone until you widen it. Each talk has one of four visibilities.",
  "about.table.who": "Who can open it",
  "about.table.listed": "Profile and RSS",
  "about.table.search": "Search engines",
  "about.table.team.who": "You, and your team among the people you share it with",
  "about.table.private.who": "You, and everyone you share it with",
  "about.table.link.who": "Anyone with the link",
  "about.table.public.who": "Anyone",
  "about.table.listed.no": "Not listed",
  "about.table.listed.yes": "Listed",
  "about.table.search.no": "Not indexed",
  "about.table.search.yes": "Indexed",
  "about.control.p2":
    "Whether readers get the script, and whether the talk takes comments, you choose talk by talk. To someone who may not see a talk, it is a page that doesn’t exist; they can’t tell it is there.",
  "about.people.title": "What you can do here",
  "about.reader.title": "If you came to read",
  "about.reader.p":
    "You need no account. The slides play in the browser as they were built, with their fonts and motion, and the script below them reads as an article whose table of contents follows the slide you’re on. You can link to any one slide, watch full screen, and follow a speaker by the RSS feed on their profile. Sign in, and you can like a talk and, where its author allows, comment on it.",
  "about.speaker.title": "If you give talks",
  "about.speaker.p":
    "You publish from the terminal, and a deck with lint errors doesn’t go up. Each publish reaches readers at once, and a new talk stays with your team until you show it to your guests or to everyone. Your profile gathers your talks as a gallery and as a timeline.",
  "about.review.title": "If you were asked to review",
  "about.review.p":
    "Point at a sentence of the script or at a part of a slide, and leave your note right there. A thread can stay within the team or be shared with guests, and a guest sees only the threads shared with them. If you were invited by email, you need no GitHub account. Your notes reach the author as data tied to a line of script.md or a slide’s file, so their agent can read them and fix the deck.",
  "about.not.title": "What dek.pub won’t do",
  "about.not.1.title": "It won’t flatten your slides.",
  "about.not.1.body":
    "They aren’t turned into images or a PDF. They run as the HTML you built, so text stays text.",
  "about.not.2.title": "It won’t publish behind your back.",
  "about.not.2.body": "A new talk is for your team alone until you widen it.",
  "about.not.3.title": "It won’t rank your talks.",
  "about.not.3.body":
    "There is no ranking and no recommendations. The top page lists talks newest first.",
  "about.not.4.title": "It won’t keep your talk from you.",
  "about.not.4.body":
    "A talk’s source is always the project on your machine. dekc build turns it into one HTML file you can put anywhere, and dek.pub’s own source is open under AGPL-3.0.",
  "about.start.title": "Getting started",
  "about.start.p":
    "Sign in once from the CLI, publish, then share the talk by its link. Each step is one command.",
  "about.start.commands": "Commands",
  "about.start.note": "New to dek? Begin with the guide:",
  "about.start.guide": "Getting started",
  "about.more.title": "Learn more",
  "about.more.publish": "Publishing to dek.pub",
  "about.more.why": "Why dek",
  "about.more.faq": "FAQ",
  "about.more.source": "The repository on GitHub",
  "about.end": "Put your next talk where it can be read.",

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
  "signin.linkSent":
    "If {email} may sign in, a link is on its way. It works once, for {minutes} minutes.",
  "signin.linkAgain": "Use another address",
  "signin.linkFailed": "That link has expired or was used already. Ask for a new one.",

  "welcome.title": "Choose your handle",
  "welcome.lead":
    "Your handle names you on dek.pub: your profile is at /@handle, and your talks are under it. You choose it once; it cannot be changed later.",
  "welcome.label": "Handle",
  "welcome.rule":
    "Lowercase letters, digits and single hyphens, up to 39, with no hyphen at either end.",
  "welcome.checking": "Checking @{handle}…",
  "welcome.free": "@{handle} is free.",
  "welcome.invalid":
    "A handle is lowercase letters, digits and single hyphens, up to 39, with no hyphen at either end.",
  "welcome.reserved": "@{handle} is kept for dek.pub.",
  "welcome.taken": "@{handle} is taken.",
  "welcome.chosen": "You have chosen your handle already.",
  "welcome.submit": "Use this handle",

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
  "profile.view": "Show talks as",
  "profile.gallery": "Gallery",
  "profile.timeline": "Timeline",
  "profile.rss": "RSS",
  "profile.empty": "No public talks yet.",
  "profile.emptyOwner": "No talks yet. Publish one from a dek project:",
  "profile.howPublishing": "How publishing works",
  "profile.ownerNote": "Only you see your talks that aren’t public here.",
  "profile.more": "Show more ({n} left)",
  "profile.fromNewest": "From the newest talk",
  "profile.moreFailed": "Could not load more talks. Try again.",

  "visibility.label": "Visibility",
  "visibility.team": "Team only",
  "visibility.private": "Team and guests",
  "visibility.link": "Link only",
  "visibility.public": "Public",
  "visibility.team.hint": "Only you and your team can open it.",
  "visibility.private.hint": "The guests you share it with can open it too.",
  "visibility.link.hint": "Anyone with the link. It isn’t listed or indexed.",
  "visibility.public.hint": "Listed on your profile and in RSS, and may be indexed.",
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
  "side.author": "Author",
  "side.date": "Talk date",
  "side.version": "Version",
  "side.duration": "Duration",
  "side.slideCount": "Slides",
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
  "talk.moreBy": "More talks by {name}",
  "talk.commentSlide": "Comment on this slide",

  "comment.placeholder": "Add a comment…",
  "comment.replyPlaceholder": "Reply…",
  "comment.empty": "No comments yet.",
  "comment.emptyHint": "Select a sentence or tap a part of a slide to comment.",
  "comment.signin": "Sign in",
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
  "comment.share": "Share with guests",
  "comment.teamOnly": "Team only",
  "comment.widen": "Share with guests",
  "comment.widened": "Shared with guests.",
  "comment.mail": "Email me about these comments",
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
  "manage.comments.off.hint":
    "No one can comment below the talk. Review threads are for the people you share it with, whatever this says.",
  "manage.comments.signed-in.hint":
    "Anyone who can open the talk and is signed in can comment below it. Review threads are for the people you share it with.",
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
  "side.guest": "Guest",
  "manage.sharing.sideHint":
    "Team members read every thread; guests read only those shared with them.",
  "manage.version": "Current version",
  "manage.version.hint":
    "Each publish becomes the version readers see, and the one before it is deleted.",
  "manage.version.none": "Nothing is published yet.",
  "manage.version.changed": "{n} slides changed",
  "manage.version.changedOne": "1 slide changed",
  "manage.version.noMessage": "No message",
  saved: "Saved.",
  undo: "Undo",

  "404.title": "This talk isn’t here",
  "404.body": "The link may be wrong, or the talk may not be shared with you.",
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
  "footer.builtWith": "Built with dek",
  "footer.about": "dek.pub について",
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
  "common.minutes": "{n} 分",
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
    "スライドは dek.pub とは別のオリジンからブラウザで再生され、フォントも動きもビートも作ったときのままです。どのスライドにも、slug でリンクできます。",
  "landing.f2.title": "記事として読める台本",
  "landing.f2.body":
    "スライドの下には、1 枚ごとに見出しと画像と話す言葉が、記事の形で並びます。ト書きは読む人に届きません。",
  "landing.f3.title": "エージェントが読むコメント",
  "landing.f3.body":
    "レビュアーは文を選ぶか、スライドの一部を指してコメントします。そのコメントは、dek の annotations と同じ形のデータで手元に戻ります。",
  "landing.recent": "新着のトーク",
  "landing.recentEmpty": "公開されたトークはまだありません。最初の 1 本をどうぞ。",
  "landing.how": "使い方",
  "landing.step1": "CLI から一度サインインします。",
  "landing.step2": "公開します。新しいトークは、公開範囲を広げるまでチームの中だけに見えます。",
  "landing.step3": "リンクを共有するか、台本ごと全体に公開します。",

  "about.title": "dek.pub について",
  "about.description":
    "dek.pub がある理由と、台本のどこまでが読む人に届くか、誰に見せるか、dek.pub がしないことを説明します。",
  "about.hero": "トークは、話し終えてからも届く",
  "about.lead":
    "dek.pub は dek で作ったトークを公開する場所です。スライドと台本を 1 つの URL にまとめ、会場にいなかった人にも、話したとおりに届けます。",
  "about.sample": "dek.pub のトーク",
  "about.why.title": "スライドだけでは、トークは残らない",
  "about.why.p1":
    "発表が終わると、残るのはたいていスライドだけです。けれどスライドは話す言葉に添えるものです。言葉の抜けたスライドを後から開いても、何を言いたかったのかはほとんど伝わりません。録画は残りますが、ひとつの要点を探して 30 分の動画を見てもらうのは簡単ではありません。",
  "about.why.p2":
    "dek では台本を先に書くので、話す言葉ははじめからテキストとしてあります。dek.pub はそれをスライドと一緒に公開します。スライドは作ったとおりに動き、台本は 1 枚ごとの見出しと画像が付いた記事として読めます。",
  "about.script.title": "台本のどこまでが届くか",
  "about.script.p":
    "声に出す言葉はすべて届き、自分のために書いたものは届きません。script.md で > を付けたト書きは、読む人に渡る台本から外されます。",
  "about.script.mine": "script.md（手元）",
  "about.script.theirs": "dek.pub の記事",
  "about.script.heading": "なぜ台本が先か",
  "about.script.direction": "会場に「スライドから作る人」を挙手で聞く",
  "about.script.said":
    "スライドは、喋るためにあります。ところが主流のツールは、どれも空のスライドを埋めるところから始まります。",
  "about.script.note":
    "ト書きを含む完全なビルドとソースもアップロードされますが、読む人に渡ることはありません。",
  "about.control.title": "誰に見せるかは、あなたが決める",
  "about.control.p1":
    "新しいトークは、公開範囲を広げるまでチームの中だけに見えます。公開範囲はトークごとに 4 つから選びます。",
  "about.table.who": "開ける人",
  "about.table.listed": "プロフィールと RSS",
  "about.table.search": "検索エンジン",
  "about.table.team.who": "あなたと、共有した相手のうちチームの人",
  "about.table.private.who": "あなたと、共有した相手の全員",
  "about.table.link.who": "リンクを知っている人",
  "about.table.public.who": "誰でも",
  "about.table.listed.no": "載らない",
  "about.table.listed.yes": "載る",
  "about.table.search.no": "載らない",
  "about.table.search.yes": "載る",
  "about.control.p2":
    "台本を読ませるかどうかと、コメントを受け付けるかどうかも、トークごとに選べます。見る権限のない人には、トークは存在しないページと同じに見え、そこにあることさえ分かりません。",
  "about.people.title": "dek.pub でできること",
  "about.reader.title": "読みに来た人へ",
  "about.reader.p":
    "アカウントはいりません。スライドはフォントも動きもそのままにブラウザで再生され、その下の台本は記事として読めます。目次には、いま読んでいるスライドが示されます。スライドには 1 枚ずつリンクでき、全画面でも見られます。話し手のトークは、プロフィールの RSS で追えます。サインインすればいいねを付けられ、作者がコメントを受け付けていればコメントも書けます。",
  "about.speaker.title": "話す人へ",
  "about.speaker.p":
    "ターミナルから公開します。lint のエラーがあるデッキはアップロードされません。公開した内容はすぐに読む人に届きます。新しいトークは、ゲストや全員に見せるまでチームの中だけにとどまります。プロフィールには、あなたのトークがギャラリーとタイムラインで並びます。",
  "about.review.title": "レビューを頼まれた人へ",
  "about.review.p":
    "台本の一文やスライドの一部を指して、その場所にコメントを残せます。スレッドはチームの中だけで続けることも、ゲストに公開することもできます。ゲストに見えるのは、公開されたスレッドだけです。メールで招待されたなら、GitHub のアカウントはいりません。あなたのコメントは script.md の行やスライドのファイルに結び付いたデータとして作者に届き、作者のエージェントがそのまま読んでデッキを直せます。",
  "about.not.title": "dek.pub がしないこと",
  "about.not.1.title": "スライドを画像にしません。",
  "about.not.1.body":
    "画像や PDF に変換せず、作ったとおりの HTML のまま動かします。文字は文字のままです。",
  "about.not.2.title": "勝手に公開しません。",
  "about.not.2.body": "新しいトークは、あなたが公開範囲を広げるまでチームの中だけに見えます。",
  "about.not.3.title": "順位を付けません。",
  "about.not.3.body":
    "ランキングもおすすめ欄もありません。トップページには、新しく公開されたトークから順に並びます。",
  "about.not.4.title": "トークを囲い込みません。",
  "about.not.4.body":
    "トークの元はいつも手元のプロジェクトで、dekc build で 1 つの HTML ファイルにすれば、どこにでも置けます。dek.pub 自身のソースも AGPL-3.0 で公開しています。",
  "about.start.title": "はじめかた",
  "about.start.p":
    "CLI から一度サインインし、公開して、リンクで共有します。どれもコマンド 1 つです。",
  "about.start.commands": "コマンド",
  "about.start.note": "dek が初めてなら、先にこちらのガイドをどうぞ。",
  "about.start.guide": "はじめる",
  "about.more.title": "もっと知る",
  "about.more.publish": "dek.pub で公開する",
  "about.more.why": "dek の設計思想",
  "about.more.faq": "FAQ",
  "about.more.source": "GitHub のリポジトリ",
  "about.end": "次のトークを、読める場所に。",

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
    "{email} でサインインできる場合は、リンクを送りました。{minutes} 分の間、一度だけ使えます。",
  "signin.linkAgain": "別のアドレスにする",
  "signin.linkFailed":
    "リンクの期限が切れたか、すでに使われています。新しいリンクを受け取ってください。",

  "welcome.title": "ハンドルを決める",
  "welcome.lead":
    "ハンドルは dek.pub でのあなたの名前です。プロフィールは /@ハンドル にあり、トークはその下に並びます。決められるのは一度だけで、あとから変えることはできません。",
  "welcome.label": "ハンドル",
  "welcome.rule":
    "英小文字、数字、ハイフンで 39 文字まで。ハイフンは続けられず、先頭と末尾にも置けません。",
  "welcome.checking": "@{handle} を確かめています…",
  "welcome.free": "@{handle} は使えます。",
  "welcome.invalid":
    "ハンドルに使えるのは英小文字、数字、ハイフンで 39 文字までです。ハイフンは続けられず、先頭と末尾にも置けません。",
  "welcome.reserved": "@{handle} は dek.pub のために取ってあります。",
  "welcome.taken": "@{handle} はもう使われています。",
  "welcome.chosen": "ハンドルはもう決まっています。",
  "welcome.submit": "このハンドルにする",

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
  "profile.view": "トークの表示",
  "profile.gallery": "ギャラリー",
  "profile.timeline": "タイムライン",
  "profile.rss": "RSS",
  "profile.empty": "公開されたトークはまだありません。",
  "profile.emptyOwner": "トークはまだありません。dek のプロジェクトから公開できます。",
  "profile.howPublishing": "公開のしくみ",
  "profile.ownerNote": "公開していないトークは、ここではあなたにだけ表示されます。",
  "profile.more": "もっと見る（あと {n} 件）",
  "profile.fromNewest": "新しいトークから見る",
  "profile.moreFailed": "トークを読み込めませんでした。もう一度お試しください。",

  "visibility.label": "公開範囲",
  "visibility.team": "チームのみ",
  "visibility.private": "チームとゲスト",
  "visibility.link": "リンクを知っている人のみ",
  "visibility.public": "公開",
  "visibility.team.hint": "あなたと、チームの人だけが開けます。",
  "visibility.private.hint": "共有したゲストも開けます。",
  "visibility.link.hint": "リンクを知っている人は誰でも開けます。一覧や検索には出ません。",
  "visibility.public.hint": "プロフィールと RSS に載り、検索エンジンに載ることもあります。",
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
  "side.author": "作成者",
  "side.date": "発表日",
  "side.version": "版",
  "side.duration": "時間",
  "side.slideCount": "スライド数",
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
  "talk.moreBy": "{name} のほかのトーク",
  "talk.commentSlide": "このスライドにコメント",

  "comment.placeholder": "コメントを追加…",
  "comment.replyPlaceholder": "返信…",
  "comment.empty": "まだコメントはありません。",
  "comment.emptyHint": "文を選ぶか、スライドの一部をタップしてコメントできます。",
  "comment.signin": "サインイン",
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
  "comment.share": "ゲストにも公開",
  "comment.teamOnly": "チームのみ",
  "comment.widen": "ゲストにも公開",
  "comment.widened": "ゲストにも公開しました。",
  "comment.mail": "このトークのコメントをメールで受け取る",
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
  "manage.comments.off.hint":
    "トークの下のコメントは誰も書けません。レビューのスレッドは、この設定によらず共有した人のためのものです。",
  "manage.comments.signed-in.hint":
    "トークを開けて、サインインしている人がトークの下にコメントできます。レビューのスレッドは共有した人のためのものです。",
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
  "side.guest": "ゲスト",
  "manage.sharing.sideHint":
    "チームの人はすべてのスレッドを、ゲストは公開されたスレッドだけを読めます。",
  "manage.version": "現在の版",
  "manage.version.hint": "公開するたびに、その版が読む人に表示され、前の版は削除されます。",
  "manage.version.none": "まだ何も公開されていません。",
  "manage.version.changed": "{n} 枚が変更",
  "manage.version.changedOne": "1 枚が変更",
  "manage.version.noMessage": "メッセージなし",
  saved: "保存しました。",
  undo: "元に戻す",

  "404.title": "このトークは見つかりません",
  "404.body": "リンクが間違っているか、あなたには共有されていないトークです。",
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

/** The reader's language: the one `?lang=` asks for, else the one they chose before, else Japanese. */
export function pickLang(
  query: string | null | undefined,
  cookie: string | null | undefined,
): Lang {
  if (isLang(query)) {
    return query;
  }
  return isLang(cookie) ? cookie : DEFAULT_LANG;
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

/** A talk's length: "12 min" or "12 分". */
export function formatMinutes(lang: Lang, n: number): string {
  return translate(lang, "common.minutes", { n });
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
