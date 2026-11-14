# Changelog

Release notes for `@hajimism/dek`. From 0.1.0 on, release-please writes this file from the Conventional Commits on `main`.

## [0.7.0](https://github.com/hajimism/dek/compare/v0.6.4...v0.7.0) (2026-11-14)


### ⚠ BREAKING CHANGES

* **pub:** `dekc pub share --comments` takes `off` or `signed-in`; `guests` is gone. A comment's `author` in `--json` output always has a `handle` and no longer has `guest`.
* **pub:** a deck already named after a command, such as pub, is no longer served by the bare dekc <name>, which runs the command. Serve it with dekc --deck <name>, which the bare dekc pub names when the project has a deck called pub, or rename the deck's folder.

### Features

* **build:** build the slides alone with --no-script ([ccaf9d0](https://github.com/hajimism/dek/commit/ccaf9d04e8ca2dbe837dc51fe9dbb1883457df8f))
* **build:** print a slide map of each deck built in --json ([cd4f0dc](https://github.com/hajimism/dek/commit/cd4f0dc076358c61f95bcf45ed8e2d69bf9f843c))
* **core:** keep a deck's dek.pub ID in script.md as pub ([472bf70](https://github.com/hajimism/dek/commit/472bf70f15e48c9f7b7f1bb773368caf01978cbc))
* **core:** keep the slugs dekc mv renames, for dek.pub to move comments by ([057f679](https://github.com/hajimism/dek/commit/057f67955edd2244300881c4832da8e0221048bd))
* **core:** map each slide of a build to its steps and spoken paragraphs ([49497bc](https://github.com/hajimism/dek/commit/49497bc06a077f5a10a040f2968c614012bd5d1e))
* **core:** write a tar that is the same bytes for the same files ([ca7e8f1](https://github.com/hajimism/dek/commit/ca7e8f1636af18805231b748412ac3c63ea022f8))
* **embed:** pass the c key from a framed deck to the page that frames it ([bb500c3](https://github.com/hajimism/dek/commit/bb500c347a004425ebdbca2720014f012e3b2379))
* **mv:** record each rename in .dek/renames.json, for dek.pub ([d613d29](https://github.com/hajimism/dek/commit/d613d292a9c305fcde4ee89634d10984a390a323))
* **pub:** add profiles with an RSS feed, and a dashboard to manage a talk ([a85a266](https://github.com/hajimism/dek/commit/a85a26681a01e26394dbecbfdb08a69270ef9096))
* **pub:** add public comments and likes, and keep review threads to grantees ([d0737e1](https://github.com/hajimism/dek/commit/d0737e1a0b24161bf091cdc641902c7fdce3def6))
* **pub:** add public comments and likes, and keep review threads to grantees ([947b820](https://github.com/hajimism/dek/commit/947b820965c28e7cc8fc9686e8145d590323e388))
* **pub:** add the design tokens, words in two languages, and component tests in a browser ([5d9ceee](https://github.com/hajimism/dek/commit/5d9ceeeede6140d055ef98208f91052cb7f0b167))
* **pub:** bound a deck's title, description and version message, and check them before a publish ([f311710](https://github.com/hajimism/dek/commit/f3117100d1d5fe0524ce1b6d4b367d84ba2f940e))
* **pub:** call the side that is not the team its guests, and share by a checkbox ([f7e927d](https://github.com/hajimism/dek/commit/f7e927dc3bca0ba29ef98a552113b62eb995a896))
* **pub:** claim a grant by address when its holder signs in or when it is made, not when a deck is read ([#119](https://github.com/hajimism/dek/issues/119)) ([bad4545](https://github.com/hajimism/dek/commit/bad4545fa6e5fb39e124177f54326d2231f53f41))
* **pub:** comment threads, grants, and a version's pictures ([7d2ca6e](https://github.com/hajimism/dek/commit/7d2ca6e37a8abd6330d02837ef38eb24e1aa14ff))
* **pub:** declare dek.pub's zones, DNS and edge rules with Alchemy, and leave its Workers to Void and wrangler ([a6707e2](https://github.com/hajimism/dek/commit/a6707e2b95ebf01e4a177bba97aa70c66cb87566))
* **pub:** enlarge a slide's picture in the article, and jump to it from a link ([0a89371](https://github.com/hajimism/dek/commit/0a893719115c9fe7d3dc884a3073a15bd6a47b1e))
* **pub:** explain dek.pub on an About page at /about, linked from the footer ([84f75e5](https://github.com/hajimism/dek/commit/84f75e5515846472b95da961ccbc5e93c734c2c9))
* **pub:** explain dek.pub on an About page at /about, linked from the footer ([7a7ca96](https://github.com/hajimism/dek/commit/7a7ca965b2f4656822f1d84568d627139c5c32d1))
* **pub:** give comment cards a quieter, thread-like shape ([1316d8a](https://github.com/hajimism/dek/commit/1316d8a7d0f976baeb4360dea5ef54416824b4bc))
* **pub:** give grants a side and threads a scope, and let every grantee read ([01665d7](https://github.com/hajimism/dek/commit/01665d7ff8fbc1c791e5a23fbf8c501ccbcee2b5))
* **pub:** give grants a side and threads a scope, and let every grantee read ([b6d2896](https://github.com/hajimism/dek/commit/b6d28961dd0557dec99163b1f8d765d8acba21e9))
* **pub:** give the talk page a side column of slides and details ([2b67398](https://github.com/hajimism/dek/commit/2b673985bf289c30add5e0c6bca6985324cdd5c6))
* **pub:** give the talk page a side column of slides and details ([1f9bf17](https://github.com/hajimism/dek/commit/1f9bf17b47032de9d28a80fd4c4b297c714f3d93))
* **pub:** keep a comment's unsent text across a reload ([ee2c356](https://github.com/hajimism/dek/commit/ee2c356ee1f2d168fd1067d3a4643bbdeabac6c6))
* **pub:** keep a comment's unsent text across a reload ([4e6882e](https://github.com/hajimism/dek/commit/4e6882ecd71cc735e812a903996bb894ecb81ef9))
* **pub:** lay out the site, with the landing, sign-in, device and not-found pages ([800d5f5](https://github.com/hajimism/dek/commit/800d5f5784de0957d8f2deba139aa1eebd556535))
* **pub:** let only signed-in accounts write public comments ([ac4c69c](https://github.com/hajimism/dek/commit/ac4c69c92548fd0e698e4e4d16129c9a4e9cb32a))
* **pub:** let the team's side read drafts, and add dekc pub promote ([318f763](https://github.com/hajimism/dek/commit/318f7630a18c6b6e121f53e1d03fb8702a99ff88))
* **pub:** let the team's side read drafts, and add dekc pub promote ([de96278](https://github.com/hajimism/dek/commit/de96278580aa3c878346ed414e1847c41ce2e19e))
* **pub:** mail invitations, sign-in links and the news of a thread ([4073f7f](https://github.com/hajimism/dek/commit/4073f7f79130ed6cba59033078b9438dd9484751))
* **pub:** mail invitations, sign-in links and the news of a thread ([709437e](https://github.com/hajimism/dek/commit/709437eda451772c80d306223c1188df286ca71b))
* **pub:** manage a deck's grants with dekc pub grants, add and remove ([#121](https://github.com/hajimism/dek/issues/121)) ([aeffb8e](https://github.com/hajimism/dek/commit/aeffb8e49221a139deb408c70fe7c01f2d849587))
* **pub:** name each of a talk's details for what it is, and give its duration ([564c8c4](https://github.com/hajimism/dek/commit/564c8c426a44746939be692ccb0ba9f27b20df3c))
* **pub:** open dek.pub in Japanese, choose the language in the footer, and show the theme in use ([2f7cc11](https://github.com/hajimism/dek/commit/2f7cc11741aeeb6ad760fb151d108bca742cbe05))
* **pub:** open dek.pub in Japanese, choose the language in the footer, and show the theme in use ([fdd45bd](https://github.com/hajimism/dek/commit/fdd45bd0d1145474bd47c58dbf20eec9ce9dc410))
* **pub:** pop the heart and burst when a reader likes a talk ([1233f43](https://github.com/hajimism/dek/commit/1233f43bbf5e6566e8494a5e4479cd316752f12b))
* **pub:** prepare dek.pub for launch: headers, robots and security.txt, input limits, and its DNS as code ([4a0a7c1](https://github.com/hajimism/dek/commit/4a0a7c1ec389aa0243ecc4d0b29533314f0874f7))
* **pub:** publish a deck on dek.pub with dekc pub ([9de2db8](https://github.com/hajimism/dek/commit/9de2db894069958ed0edf119d84595981a7ba5c0))
* **pub:** reserve command names, pub among them, as names no deck takes ([b760bee](https://github.com/hajimism/dek/commit/b760beef069391b74fe9a72f8980295005f6fb1f))
* **pub:** send HSTS and a permissions policy from every answer, and serve a 500 page of its own ([6baf297](https://github.com/hajimism/dek/commit/6baf29751892030d8302b9b1d67eb79e678e803e))
* **pub:** serve a sitemap, and give the landing and About pages a canonical URL in each language ([#118](https://github.com/hajimism/dek/issues/118)) ([e7172a1](https://github.com/hajimism/dek/commit/e7172a16f5b3193a0e8d9a4415e1ffbd898e0fd4))
* **pub:** serve decks from their own origin, and take versions from dekc ([3391e1a](https://github.com/hajimism/dek/commit/3391e1a5ddef5a28048ac576df794aa218c0e228))
* **pub:** serve robots.txt and security.txt, and name dek.pub in SECURITY.md's scope ([c89e66e](https://github.com/hajimism/dek/commit/c89e66e9846a4a0cb4ddac995390f845678a1c14))
* **pub:** set comment cards beside what they point at, and make the device form work before scripts load ([32cb8eb](https://github.com/hajimism/dek/commit/32cb8eb7c2b98fe427b5c0e676fe23a6a1949476))
* **pub:** show a profile's talks 24 at a time with Show more, and keep its feed at the newest 50 ([#120](https://github.com/hajimism/dek/issues/120)) ([6948bb1](https://github.com/hajimism/dek/commit/6948bb1006d8f96d4c4bc2e4ec8407c961c5f3c0))
* **pub:** show a profile's talks as a gallery or a timeline, in tabs ([761052e](https://github.com/hajimism/dek/commit/761052e7f6a2b1c91cdd775f8018035a3ef47062))
* **pub:** show a talk as its slides and script, with comments in the margin ([90864eb](https://github.com/hajimism/dek/commit/90864ebad953cbe14cae0d265b7f4edcf087e931))
* **pub:** show a talk full screen, with a header and a review mode ([eee5eee](https://github.com/hajimism/dek/commit/eee5eeee50ccde8051a648ad076a448c698fbb24))
* **pub:** take the talk page's table of contents to the article ([6703241](https://github.com/hajimism/dek/commit/6703241163d6ba596fba1a24347809d39d4a326f))
* **runtime:** let a page that frames a built deck drive it through postMessage ([8a53629](https://github.com/hajimism/dek/commit/8a536294ede0416a8c49f7c95bcea3e85ed321af))
* **runtime:** show a framed deck's slide alone, without the rail or the key hint ([2f2c852](https://github.com/hajimism/dek/commit/2f2c8526eb663909bafad7bcda4f6e55333da2c8))
* show a dek.pub talk full screen with a review mode, and pass c from a framed deck ([a828eb9](https://github.com/hajimism/dek/commit/a828eb912e07c3624a895c36a25e9b1b3d82d4da))


### Bug Fixes

* **mv:** record a rename made by hand once, and keep records made at once ([f2b4e10](https://github.com/hajimism/dek/commit/f2b4e109472e2fb870177ed2ecd2ff5f14d07585))
* **pub:** add a reply the API answers with to its thread, and set Japanese titles as Japanese ([aad6366](https://github.com/hajimism/dek/commit/aad636629f8c3644aa4dba7edd2b3845d032a065))
* **pub:** ask whoever opens /device from a link to check the code against their own terminal ([346ef83](https://github.com/hajimism/dek/commit/346ef839700328412a982884b71c4fe4452c9473))
* **pub:** believe a framed deck only as far as the page asked, and keep its popups sandboxed ([b62f4db](https://github.com/hajimism/dek/commit/b62f4db8ec69629a9978ec4cf000f6001caeaa59))
* **pub:** close the holes a review of the server found ([46656e2](https://github.com/hajimism/dek/commit/46656e2fe7e423641e6eea30f6b0d66585121c4a))
* **pub:** decide once which comments are drawn, and draw no deck mark for a detached one ([e2c5d12](https://github.com/hajimism/dek/commit/e2c5d12f5db499ab93dbb4978ef2dd08537e23a0))
* **pub:** draw ID characters without bias, and run knip without Void's generated files ([49efd22](https://github.com/hajimism/dek/commit/49efd2284c41dc7e0465cfec2b7cc561eee6f175))
* **pub:** feature a chosen talk, keep quoted script from readers who cannot see it, and read profile paths and feeds safely ([0c3d1ab](https://github.com/hajimism/dek/commit/0c3d1abd4a747e7dca69631f95760b7fb93c5fcd))
* **pub:** give the serve Worker's tests one vitest ([272667d](https://github.com/hajimism/dek/commit/272667d9efcd3db257ecfd66231b3531a4745b41))
* **pub:** hear a deck that is ready before the page's script runs, and open it at the linked slide ([633130a](https://github.com/hajimism/dek/commit/633130a02bc133af0743e96ece761bde10257c9d))
* **pub:** keep a grant's name and its choices in the row on a phone ([fbf3fe3](https://github.com/hajimism/dek/commit/fbf3fe3e66306df2bde53b336e69358c1354c9ad))
* **pub:** keep dek.pub's pages unframed and its changes same-origin ([468e31f](https://github.com/hajimism/dek/commit/468e31fd56c54701ccb944e080a9d08947e56343))
* **pub:** keep the script article's slides to the width of its text ([6eee8b1](https://github.com/hajimism/dek/commit/6eee8b17b1033c963055e30ea71f9d9881e5d71d))
* **pub:** leave quoted script out of comments for readers it is hidden from ([a9e080d](https://github.com/hajimism/dek/commit/a9e080d316d0001ca7f5d67f1ae3c12982cc7fef))
* **pub:** leave the wordmark off the sign-in card, which the header already carries ([489680c](https://github.com/hajimism/dek/commit/489680cb708e0881514f70728f924e80b8f349c5))
* **pub:** let a thread's author resolve, reopen or share it only while the deck is shared with them ([77a3582](https://github.com/hajimism/dek/commit/77a358217d35e4f46a3f9865583c65fb352c5d4c))
* **pub:** line the talk page up on one left edge, and give the deck the keys after a jump ([9887fcf](https://github.com/hajimism/dek/commit/9887fcf47ed0ee3c50938f21c2ca3c0f26b76bae))
* **pub:** link a profile to GitHub only when its account signs in with GitHub ([ef1f56e](https://github.com/hajimism/dek/commit/ef1f56e275f2e22f38de657efa364f14b62f9d85))
* **pub:** make the comment drawer and sheet proper dialogs, name the pins, and keep times and language links current ([5a1f2dd](https://github.com/hajimism/dek/commit/5a1f2dd2ce5cde918b2f53c466dcaf2218d352f7))
* **pub:** move focus with the arrows in a segmented control and choose with Enter or Space ([822e860](https://github.com/hajimism/dek/commit/822e860d3ab806aab46a4e7bed70fa4edb83dd0a))
* **pub:** name the R2 bucket in void.config.ts so the app and the serve Worker share it ([8a8a2b4](https://github.com/hajimism/dek/commit/8a8a2b4c726a589429d153950fe6d25742e62b32))
* **pub:** name the R2 bucket in void.config.ts so the app and the serve Worker share it ([34f44f8](https://github.com/hajimism/dek/commit/34f44f8ef459de4161ba9e390022018bfc65f4d8))
* **pub:** name the slide in its jump link ([22a47a5](https://github.com/hajimism/dek/commit/22a47a59989a164e8171c24990d100a93e544b01))
* **pub:** open the publish guide from the owner's empty profile, in a new tab ([425a92e](https://github.com/hajimism/dek/commit/425a92ec40cb595bbb0b32200001137877453997))
* **pub:** picture each slide at its last beat for the script article ([d476b62](https://github.com/hajimism/dek/commit/d476b626ea3e6dde05f2a9d86d7215e2c750df1f))
* **pub:** publish under a slug of its own, within the size dek.pub takes ([647faa6](https://github.com/hajimism/dek/commit/647faa64d9014ab90891538e53b1cfc0c0fa4507))
* **pub:** read answers that grow, and keep the key and the sign-in safe ([ba7cbac](https://github.com/hajimism/dek/commit/ba7cbac972b4b72b599b87e998f622fde2b55e8f))
* **pub:** run the serve Worker's tests with its own Vitest ([db1d29e](https://github.com/hajimism/dek/commit/db1d29ec8b37f3c2f578705b650a95b8eb40ba5c))
* **pub:** say stage directions never reach readers, not that they never leave the machine ([cebc93f](https://github.com/hajimism/dek/commit/cebc93f945aefccc2e16101f44b32e28581e00d3))
* **pub:** share a team thread under one number when it is shared twice at once ([0eec363](https://github.com/hajimism/dek/commit/0eec363a9cd3b3a872e055de4ffe087809f3f284))
* **pub:** show the owner a talk whose versions are all unpromoted ([cc15d81](https://github.com/hajimism/dek/commit/cc15d81a1df3093fb3c0dc452f4416413f84bae7))
* **pub:** stop the dev server when port 5173 is taken ([d675a08](https://github.com/hajimism/dek/commit/d675a084d513a8b952a9e1f667ddcd929032d491))
* **pub:** three small bugs found in a review of apps/pub ([568faeb](https://github.com/hajimism/dek/commit/568faebb703e56b3101fe62086150f58e4fe3a97))
* **pub:** widen the text beside the comments, stick the panel's head as one piece, and show the jump link on hover ([8f75ef2](https://github.com/hajimism/dek/commit/8f75ef28b1c137a795477f3c3d10a2210977cf24))
* **runtime:** keep a framed deck's moves out of the framing page's history ([b7322da](https://github.com/hajimism/dek/commit/b7322da13bfbc35ff4399aa2a9e442cbf332e52a))
* **runtime:** move on when a slide transition is never drawn ([1274ee4](https://github.com/hajimism/dek/commit/1274ee4e90806471dabe20f24b29598113570b5c))


### Refactoring

* **annotate:** replace the history entry without location.replace ([a19b1f5](https://github.com/hajimism/dek/commit/a19b1f551da61ba3d5230793cd49f9b93c2f4e9b))
* **annotate:** replace the history entry without location.replace ([4d3191c](https://github.com/hajimism/dek/commit/4d3191ce02daeeff8028ec6a766265a046a91593))
* **pub:** build the way to sign in, read the session and call the API in one place each ([2d9e70f](https://github.com/hajimism/dek/commit/2d9e70f391835c03ca7d29dff7c0603e6c4aebb1))
* **pub:** build the way to sign in, read the session and call the API in one place each ([2203b8d](https://github.com/hajimism/dek/commit/2203b8d42366c76ce12262ab94f0fa6773aeca66))
* **pub:** decide where a person stands with a deck in one pure function ([67884dd](https://github.com/hajimism/dek/commit/67884ddb9a2fab90076f04b261c4f3cb558c5dda))
* **pub:** decide where a person stands with a deck in one pure function ([356d6ea](https://github.com/hajimism/dek/commit/356d6ea68227fa1ac8763e0c2cb6e3a7c73039f6))
* **pub:** drop the review panel's dead sign-in link, and say a link's lifetime from one constant ([79cdaba](https://github.com/hajimism/dek/commit/79cdaba36f440e64b414083a273988ec822012de))
* **pub:** drop the review panel's dead sign-in link, and say a link's lifetime from one constant ([e80eaa0](https://github.com/hajimism/dek/commit/e80eaa0793678562a0e602f8970b6d0c271c50fa))
* **pub:** export only what other modules use, and share who may resolve a comment ([f5979b8](https://github.com/hajimism/dek/commit/f5979b8bdeff982403976836816e99cff5d20d04))
* **pub:** keep public comments in the deck model beside its likes ([13a8635](https://github.com/hajimism/dek/commit/13a8635f8eb27341f61240f5fe35ea0460d92112))
* **pub:** keep public comments in the deck model beside its likes (ADR 76) ([a384f51](https://github.com/hajimism/dek/commit/a384f511d06a99227dab7f30167605a4fe9be1ea))
* **pub:** name a comment's author in the person model ([f792bb5](https://github.com/hajimism/dek/commit/f792bb56c693ec1f15ca25922c07961782d47399))
* **pub:** organise dek.pub by the model a person deals with ([#92](https://github.com/hajimism/dek/issues/92)) ([68ba35d](https://github.com/hajimism/dek/commit/68ba35d0ab2a97e248938331942421d0e4912839))
* **pub:** refuse a thread change and a public comment in one place each ([79a48cc](https://github.com/hajimism/dek/commit/79a48cc2750cb76cc0aff86050de29c68fc8c965))
* **pub:** refuse a thread change and a public comment in one place each, and hold two more model rules in the boundaries test ([0246513](https://github.com/hajimism/dek/commit/02465137971b394ab2c83820cbd331dc73c7d45a))
* **runtime:** keep the dev server's stamps out of a build's player ([9c2cb47](https://github.com/hajimism/dek/commit/9c2cb4766aea8453075df2e155d2863d8ebab24b))


### Documentation

* document dekc pub, the pub key, and where the dek.pub key is kept ([aeb2ebf](https://github.com/hajimism/dek/commit/aeb2ebfb8b423900899cb8f2d74a740cdc5a4e72))
* **pub:** document --slug, DEK_TOKEN_SERVER, and answers that grow ([6fc971b](https://github.com/hajimism/dek/commit/6fc971bef47ea747939011da34bb7935b7b4ddab))
* **pub:** list what dek.pub does not do yet ([b3c22e9](https://github.com/hajimism/dek/commit/b3c22e9e207f9189698ca13eac3a2bdbfbe87fa7))
* **pub:** list what dek.pub still lacks before it runs for real ([d44147b](https://github.com/hajimism/dek/commit/d44147b9ffbbd299e1300fa728ff0b28e3230b8d))
* **pub:** list what the comments for client work still lack ([8ed43db](https://github.com/hajimism/dek/commit/8ed43db27003d60da6ee988722fd37cfb5a679a6))
* **pub:** order dek.pub's TODO by what its invitation-only opening needs ([d17d02d](https://github.com/hajimism/dek/commit/d17d02d238237dc8447d4a7189893005baaae730))
* **pub:** record how dek.pub is built and licensed ([a12fff9](https://github.com/hajimism/dek/commit/a12fff9d4f9d17517f37d1476dbda3080bf019b9))
* **pub:** record where public comments live and what a feature is (ADR 76) ([9e96b03](https://github.com/hajimism/dek/commit/9e96b03f97e6a333ddabe85637d5476c82328b5d))

## [0.6.4](https://github.com/hajimism/dek/compare/v0.6.3...v0.6.4) (2026-11-12)


### Features

* **annotate:** list every note from the count, and go to one from it ([#88](https://github.com/hajimism/dek/issues/88)) ([c3d5ea6](https://github.com/hajimism/dek/commit/c3d5ea601fda7a99f2ba3bc961cae12e1a13f894))

## [0.6.3](https://github.com/hajimism/dek/compare/v0.6.2...v0.6.3) (2026-11-11)


### Features

* have dekc init install the running dek into the project, and Playwright with --browser ([5a857c6](https://github.com/hajimism/dek/commit/5a857c6e0bb08d3f159a94f3c208e61983b45fb4))
* have dekc init install the running dek into the project, and Playwright with --browser ([d9a6bcc](https://github.com/hajimism/dek/commit/d9a6bcc4182062fe53c873b243196acfbf1ff028))


### Bug Fixes

* have dekc init run no one's scripts, retry Chromium, and name bun's first error ([1e56ae5](https://github.com/hajimism/dek/commit/1e56ae51da4ed70000e5684235390d728b28093e))
* name the word-break declaration DEK035 says to delete, not the file ([366038c](https://github.com/hajimism/dek/commit/366038c4eca11458e0cd1a8c55d2ab522c87a7f9))
* name the word-break declaration DEK035 says to delete, not the file ([5c5a943](https://github.com/hajimism/dek/commit/5c5a943ced5ed3557fd57174060a032142de44d7))
* **sample:** count what dek 0.6.3 has, and line annotate's chevrons up with their lanes ([#84](https://github.com/hajimism/dek/issues/84)) ([d521a42](https://github.com/hajimism/dek/commit/d521a421b0b11a2039f4f873f0bd1442c3bdc768))


### Documentation

* compare with Slidev and Marp as they are now, and lead with checks over outputs ([1afdc91](https://github.com/hajimism/dek/commit/1afdc9154cb7377976367dc7811a4d6ceaf31ad8))
* compare with Slidev and Marp as they are now, and lead with checks over outputs ([0219fcf](https://github.com/hajimism/dek/commit/0219fcf9fe7946743e3ff3954c75a643839a8578))
* **sample:** check the sample's Japanese with dek-words and a list drawn from yomiyasu ([1ab1d0c](https://github.com/hajimism/dek/commit/1ab1d0c0d5f92f3e6d7e20ffd784869af58d8d83))
* **sample:** check the sample's Japanese with dek-words and a list drawn from yomiyasu ([233724c](https://github.com/hajimism/dek/commit/233724c1d9169b0cd6e36750e41179651c995a92))

## [0.6.2](https://github.com/hajimism/dek/compare/v0.6.1...v0.6.2) (2026-11-11)


### Features

* break Japanese by phrase in browsers without auto-phrase ([#77](https://github.com/hajimism/dek/issues/77)) ([e40780e](https://github.com/hajimism/dek/commit/e40780ef1c2b119b37348a40959225101273a41e))

## [0.6.1](https://github.com/hajimism/dek/compare/v0.6.0...v0.6.1) (2026-11-09)


### Features

* run a project's plugins in dekc check, for the slide it checks ([8f091ca](https://github.com/hajimism/dek/commit/8f091ca1ee65f0c2994f59ad1f40bcb30ac35141))
* run a project's plugins in dekc check, for the slide it checks ([07cd3cc](https://github.com/hajimism/dek/commit/07cd3ccc14ec5ce0ff299880f2895780438a1510))


### Bug Fixes

* tell the agent to deal with lint's warnings, and which plugin data is whose ([8550412](https://github.com/hajimism/dek/commit/85504129dbe29b3a4b3b92b7033a903ef7c321e2))
* tell the agent to deal with lint's warnings, and which plugin data is whose ([7e69b3b](https://github.com/hajimism/dek/commit/7e69b3b525421f08de65fe806b525d70504e7923))


### Documentation

* **adr:** record what AGENTS.md says of warnings and of whose plugin data is ([d42d28f](https://github.com/hajimism/dek/commit/d42d28f4d70572ecdd0e5ea9c15678f69b46af17))
* say in the lint reference that plugins run in dekc check too ([c7f0cbb](https://github.com/hajimism/dek/commit/c7f0cbbbf49cf3bccab9cc7996f49d8e067d8f73))

## [0.6.0](https://github.com/hajimism/dek/compare/v0.5.1...v0.6.0) (2026-11-07)


### ⚠ BREAKING CHANGES

* a skipped check can now be "plugin" in --json (ADR 31).

### Features

* let a plugin the user installed check a deck in dekc lint ([847822c](https://github.com/hajimism/dek/commit/847822cdfb34f4931c284b103007cb10d0dfc450))
* **plugins:** lay dek-study's sheet over the slides ([8886efc](https://github.com/hajimism/dek/commit/8886efc9b8a0b9bd4bc47290574654e79be32368))
* **plugins:** let a plugin keep data for the whole project in plugins/&lt;name&gt;/ ([84add8a](https://github.com/hajimism/dek/commit/84add8ab77918fdbfd60bfced6c18a103b1de0b1))
* **plugins:** ship dek-study inside dek as its first official plugin ([96595d5](https://github.com/hajimism/dek/commit/96595d5f3996c597a1c47564a736ef0ca5ae9413))
* **plugins:** ship dek-study inside dek, with a sheet of stickers over the slides ([855908c](https://github.com/hajimism/dek/commit/855908c03305aa8e8284c890bea0e19e25986994))
* **plugins:** ship dek-words, a check for a project's word list ([9eff6d1](https://github.com/hajimism/dek/commit/9eff6d13cb2727b0f0cf1aa8bdc9595ee4d5c1c1))
* **plugins:** ship dek-words, a check for a project's word list ([07d8f54](https://github.com/hajimism/dek/commit/07d8f54908ef8cd1e52cbf9cec5e576f929e55fb))
* **plugins:** show a plugin's page in the player and builds behind page API 1 ([b815ef6](https://github.com/hajimism/dek/commit/b815ef625444c572a13af1a6e0ab0dddfbffcb22))

## [0.5.1](https://github.com/hajimism/dek/compare/v0.5.0...v0.5.1) (2026-10-30)


### Bug Fixes

* **cli:** stop a dev server whose parent died before the server was up ([80b533f](https://github.com/hajimism/dek/commit/80b533fc691cfc104b6c83f7d99be4d73fc75c8d))
* **dev:** say when the running server serves another deck only ([333ae06](https://github.com/hajimism/dek/commit/333ae06818fa8ad09f5ed492ae33148cce9254fd))
* judge a command that skips its stdin by how it exits, not as one that cannot start ([103152c](https://github.com/hajimism/dek/commit/103152cd2132ba9c430ede4d7020844f7a8dcf9a))
* **lint:** free no DEK013 class a skeleton or a slide script may use ([e32638b](https://github.com/hajimism/dek/commit/e32638b12220055d8a5a329b9e93f9eda47371e8))
* **lint:** name the files a hint sends you to as paths from where the command ran ([5943dbe](https://github.com/hajimism/dek/commit/5943dbe1b11ac4529faae9cc1b98f22b4c63d214))
* **lint:** name the files a hint sends you to as paths from where the command ran ([c5fcce3](https://github.com/hajimism/dek/commit/c5fcce3101061a6eaad55b27d94019f5b028e762))
* **lint:** say how to stay within max_classes in DEK013 and DEK026 ([9c3078b](https://github.com/hajimism/dek/commit/9c3078bad4d93e5f381c99f5b6e0dd2c059f32dc))


### Documentation

* say that DEK035 leaves a deck that breaks by phrase to Chromium ([c21b428](https://github.com/hajimism/dek/commit/c21b4284db4a46a231778a4fa8d42aac38c46b0d))
* say that DEK035 leaves a deck that breaks by phrase to Chromium ([dfef085](https://github.com/hajimism/dek/commit/dfef085bedf2d120c62a0f7418fd3d69f0a77001))

## [0.5.0](https://github.com/hajimism/dek/compare/v0.4.0...v0.5.0) (2026-10-27)


### ⚠ BREAKING CHANGES

* **ref:** a dek.toml that pins a ref whose name holds a control character or a character a person cannot see no longer loads until that line is removed; `dekc pack` refuses a deck so named until its folder is renamed; and `dekc new` and `dekc init --deck` refuse such a name, which they took before. Every other name works as before.
* where Chromium's sandbox does not start, `dekc shot <ref>` fails until DEK_ALLOW_UNSANDBOXED=1 is set.

### Features

* **ref:** report the characters in a ref that a person cannot see ([5ca233e](https://github.com/hajimism/dek/commit/5ca233e186125e821f1341cc790636f26654274a))


### Bug Fixes

* **build:** keep a minified stylesheet reading as its source where an escape meets a newline or a comment ([41fd1ba](https://github.com/hajimism/dek/commit/41fd1ba08abc63c8af1d9deb8e2b9d70bb5ceab5))
* **build:** minify a stylesheet into one that reads as its source does ([bdcffb9](https://github.com/hajimism/dek/commit/bdcffb9edaf7238b33bdf740dc4072c6f8cdaaa1))
* **cli:** at the project root, hint a command only for the decks that have what it names ([fe3f8fb](https://github.com/hajimism/dek/commit/fe3f8fb12c178a7d8bfcb40b4ed16b52d03a08ae))
* **cli:** hint `dekc ls` for a deck that is not there, not `dekc ls <it>` ([1ee4554](https://github.com/hajimism/dek/commit/1ee455439734f57eaf03c6c91fd78a9423f4812f))
* **cli:** name a ref by the ref in the hints about it ([e9d1a47](https://github.com/hajimism/dek/commit/e9d1a47fe282b766bed189212891f1aafcc38a94))
* **dev:** print a failure of the dev server's lint or voice run instead of dropping it ([14a8e8c](https://github.com/hajimism/dek/commit/14a8e8ceb75247d850407aeeef3bba56f5525a88))
* give up on a voice engine, a dev server, or a rumdl that never answers ([19023f2](https://github.com/hajimism/dek/commit/19023f2c3987c4e60f2fe7440d4e1d5369ec2f10))
* keep a file's mode when dek writes it anew ([085d7e8](https://github.com/hajimism/dek/commit/085d7e8e4be2895c975cd76668d4c7af91937d96))
* **lint:** list rumdl as skipped when what it printed is not SARIF ([74582e0](https://github.com/hajimism/dek/commit/74582e07153aeb77211083e87309cbe6214e8ba3))
* **lint:** name the path beside a stray space in DEK021's hint only when it is a plain word ([b030691](https://github.com/hajimism/dek/commit/b03069178ab6b318749c0296aca5fc916ebc2cec))
* **lint:** read a URL in DEK011 as the browser's URL parser reads it ([c0950a5](https://github.com/hajimism/dek/commit/c0950a59b6c25f1c561c101a07750b89c0a87283))
* **lint:** say to run lint --visual again after lint --visual fails ([a00da44](https://github.com/hajimism/dek/commit/a00da4437aadf6373a4e888213f26d6efdd7462a))
* **ls:** keep a ref's title, event, and date to one line, as AGENTS.md does ([af85b6e](https://github.com/hajimism/dek/commit/af85b6e8ef63175cfb3166465e533e6b361f166e))
* **mv:** write script.md, slides, and voice.toml whole, never over the old file ([a7a22b3](https://github.com/hajimism/dek/commit/a7a22b34a1fb073181966bec4a7c7e88b88757ce))
* print no color code a deck or a ref wrote, only dek's own ([27b6751](https://github.com/hajimism/dek/commit/27b6751eb48d84e2538983c618889f74389d5caa))
* read a pack's or a GitHub tarball's tar with dek's own reader, so it unpacks no more than was counted ([bdda596](https://github.com/hajimism/dek/commit/bdda596bf5974e6c30f5d273090327d0ed114a6b))
* read each attribute value as the browser does, its character references decoded ([65a58d1](https://github.com/hajimism/dek/commit/65a58d11497648690c539c8caa4bbe49c246a4c8))
* read the keys after an array or inline table written over several lines ([fa8f268](https://github.com/hajimism/dek/commit/fa8f2680bec36c3b092f5b7eef5749cd4146d64a))
* read url() and a string cut short by CR or FF where the browser does ([55296f2](https://github.com/hajimism/dek/commit/55296f2a8f04ffdea958b835132bc2ad4c8054d5))
* **ref:** keep a ref's names out of hints, and to one short line in messages ([67f7d19](https://github.com/hajimism/dek/commit/67f7d19268cb1032978d62a1a0fe1ec2a209197c))
* **ref:** refuse a pack whose deck's name holds a control character or one a person cannot see ([373f14f](https://github.com/hajimism/dek/commit/373f14f368057677c33d9c8bbaccc427e048d790))
* **sample:** set the note on why-dek's read-only card in ink ([586d09d](https://github.com/hajimism/dek/commit/586d09d7e706ae56b731ee9c5a4b6f1b03406d2e))
* say whenever Chromium draws without its sandbox, and draw a ref there only when asked ([293b3ff](https://github.com/hajimism/dek/commit/293b3ffd0fd12ff042831fc4816e96025d7336af))
* **server:** keep what the dev server serves out of other sites' pages and frames ([260b0f0](https://github.com/hajimism/dek/commit/260b0f081de5d9821312456abbec2849dfac7fd7))
* **shot:** send a ref's broken slide script to its author, not to lint ([c1045fa](https://github.com/hajimism/dek/commit/c1045faf8583ca61281b825811a172a72ec0bb6c))
* **show:** keep the name of keyframes written as a string in the theme excerpt ([072b078](https://github.com/hajimism/dek/commit/072b07848a2799f7d2e98f42962330c2e407bbee))
* **show:** say a slide is a ref's, and start a part on a line no file can write ([b6b2389](https://github.com/hajimism/dek/commit/b6b2389fe5cf8dfc9dac4fefa1eab88737d7075a))
* sort dict.toml, decks, and slide files the same way on every machine ([29a3f3c](https://github.com/hajimism/dek/commit/29a3f3c4c6073fbdc5808c9921d296fa8e4125cf))
* start every program dek runs with the environment as it is now ([ee6b319](https://github.com/hajimism/dek/commit/ee6b319d2772ff39ea82cf3dd8fd763d4fb130c8))
* stop a command at its timeout, even one that ignores SIGTERM or leaves a process behind ([3b05db7](https://github.com/hajimism/dek/commit/3b05db7ee9c17e68e5d580d744dc457856c29678))
* **tar:** leave AppleDouble names out, and number that record 27 ([c4fb0ef](https://github.com/hajimism/dek/commit/c4fb0efbb9cd0a73f5335f078fb9b08bca1d35ef))
* **video:** give up on an ffmpeg that never answers -version ([c0d3c6a](https://github.com/hajimism/dek/commit/c0d3c6a22d0dd8328782661ebc22384313d33487))
* **visual:** stop sending a DEK031 to theme.css when the theme alone was never measured ([b3321b3](https://github.com/hajimism/dek/commit/b3321b3302389743dd5f0606e2a6367e2635f14d))
* **voice:** stop waiting on a player that never ends after a say clip ([fc1082b](https://github.com/hajimism/dek/commit/fc1082bf3e8eb012bda822256fe51a067eb086b8))


### Refactoring

* write the link preview image and remove the dev server's lock through safe-fs ([3ae94c8](https://github.com/hajimism/dek/commit/3ae94c8db6ae9bef4243bec3cc334e1a4a2b9e11))


### Documentation

* **adr:** keep a ref's words out of dek's hints, and mark what a ref wrote wherever dek prints it ([e4f0787](https://github.com/hajimism/dek/commit/e4f07878aee0f0f887484b800778324a55e0f97d))
* **adr:** number the --json contract record 31 ([8108f37](https://github.com/hajimism/dek/commit/8108f3770b3c2b24efb57b2ed1064949a998e95b))
* **adr:** number the fast-check record 26, where this stack adds it ([389948e](https://github.com/hajimism/dek/commit/389948e6e8ef79842d8b429fac5e2d8e5d2ddeb2))
* **adr:** number the ref-words record 30, and point it at the trust record ([6925755](https://github.com/hajimism/dek/commit/692575572ab5a235ac1256c7b7b11e31a4ddc01f))
* **adr:** number the sandbox record 29, and point it at the trust record ([e082487](https://github.com/hajimism/dek/commit/e08248711777c3acabd8ac46c1c8a080302de961))
* **adr:** number the trust record 28, after the records already on this branch ([7a7fbd8](https://github.com/hajimism/dek/commit/7a7fbd8b9cb6f18af2d27f26a1fb962c3e85f30a))
* **adr:** read a pack's or a repository's tar with dek's own reader ([ba896c8](https://github.com/hajimism/dek/commit/ba896c84daec4a39fdc5d7fdd34c1cf5ccb52394))
* **adr:** read every attribute value as the browser does ([6a1c698](https://github.com/hajimism/dek/commit/6a1c698fbc74da129c034f175063d8c99a83f9bc))
* **adr:** say what dek does where Chromium's sandbox cannot start ([f2f940a](https://github.com/hajimism/dek/commit/f2f940ad4c0a216f9f0ec0085da72cfd15414282))
* **adr:** say whom dek trusts, and what each of them may make it do ([8f26099](https://github.com/hajimism/dek/commit/8f260990674b3c3105b40b276f9e90c6e013e1db))
* pass the suite timeout on every bun test line in CONTRIBUTING ([6c7182c](https://github.com/hajimism/dek/commit/6c7182cab0564f91088be06b5209c32b6f191efa))
* say how dek keeps a ref's words apart from its own ([756ba7c](https://github.com/hajimism/dek/commit/756ba7ca74ff05cbd109ef0eab270dea92c52b78))
* say how long dek waits on rumdl, a voice engine, and the dev server, and how large a ref may be ([e196cd8](https://github.com/hajimism/dek/commit/e196cd81ad83cd90286a91977258bb7c0882eaee))
* say lint reads an attribute's value and URL as the browser does ([4c67184](https://github.com/hajimism/dek/commit/4c671849309e7ff8015341862b9fc8ec860d0cb7))

## [0.4.0](https://github.com/hajimism/dek/compare/v0.3.4...v0.4.0) (2026-10-27)


### ⚠ BREAKING CHANGES

* **theme:** `dekc theme --json` lists in `layouts` only layouts whose names are plain words: letters, marks, and digits of any script and `@%+=:,./_-`, not starting with `=`. A layout whose name holds anything else, such as a space, a quote, `$`, `;`, or a backtick, is no longer in `layouts`; `unprintedLayouts`, present only when there are some, says how many were left out. `dekc theme <layout>` still prints such a layout's example.
* **ref:** a dek.toml whose [refs] pins a deck name with any other character, starting with a dash, not in NFC, or longer than 64 characters or 200 bytes, such as `owner/repo/talk(1)` or `file/a+b`, no longer loads. Delete the line the error points at, and for a pack its packs/<deck>.tgz and refs/file/<deck>, then pin the deck again under a name a ref can carry.

### Bug Fixes

* **annotations:** show a deck, slide, or beat that is no plain word as a placeholder in the notes ([3b04e89](https://github.com/hajimism/dek/commit/3b04e89dc22f9ea421919c920594f53a9c02d3be))
* **cli:** say once where to find a deck's name a retyped command leaves as &lt;deck&gt; ([d4a57d9](https://github.com/hajimism/dek/commit/d4a57d9f7836b2ba2433dc634a136bb7e97be509))
* **config:** show a key that is no plain word as &lt;key&gt; in an error ([22476a7](https://github.com/hajimism/dek/commit/22476a712ecf0ee4e3c552b1e0fe6f35ac10cacf))
* **dev:** read .dek/server.json only as the dev server writes it ([c402cb6](https://github.com/hajimism/dek/commit/c402cb6282783425611274fbc0337cd6652add7e))
* **dev:** read the lock a dev server on port 80 writes ([665e0e2](https://github.com/hajimism/dek/commit/665e0e237c3a639a45fa36dc14ed8bd2e7ad9168))
* keep reads, writes, and suggested commands inside what the project and dek wrote ([23a667d](https://github.com/hajimism/dek/commit/23a667d199ee5f0b34040c4c33f0c0bcfd47f819))
* **lint:** name a remote file in DEK020's hint only when it is a plain word ([fb77d02](https://github.com/hajimism/dek/commit/fb77d028db1bb38bea6b43695838d52776b192a7))
* **lint:** name a slide or asset file in a hint only when it is a plain word ([eeb240c](https://github.com/hajimism/dek/commit/eeb240c418b615067bd66ff45ac6b70361d3bd1b))
* **lint:** show an unknown key that is no plain word as &lt;key&gt; in DEK008 ([f950def](https://github.com/hajimism/dek/commit/f950def7f80f06da46bd8c913ae84c8c849d5ddf))
* never follow a link under refs/ when writing a snapshot ([0c843ea](https://github.com/hajimism/dek/commit/0c843ea4193270dd1cc0fde4a04768e210efd911))
* never write or remove a pack's copy through a link under packs/ ([95980a6](https://github.com/hajimism/dek/commit/95980a631e90ee97eda24784ded50b042111512d))
* quote every name in a command dek suggests ([d1e608d](https://github.com/hajimism/dek/commit/d1e608d5676e46b7947bd5f43a3315269fd27773))
* read a project's files only through links that stay inside it ([7ae3815](https://github.com/hajimism/dek/commit/7ae38152eadd6f58d67034169ade9dd749038002))
* **ref:** accept only letters, digits, dots, dashes, and underscores in a ref's deck name ([1b430e1](https://github.com/hajimism/dek/commit/1b430e1ea3d0f66af2642a5f257af1cefcae3ac0))
* **ref:** fold names as macOS does when telling whether two refs share a folder ([fdb32ee](https://github.com/hajimism/dek/commit/fdb32ee103facc5a661f20dabf79fe8f91ae48cd))
* **ref:** refuse a pin whose folders another ref already takes ([0d550d8](https://github.com/hajimism/dek/commit/0d550d897b0cdad86ac3de181bf7fd031061bd66))
* refuse a decks folder that links out of the project ([83f2ff0](https://github.com/hajimism/dek/commit/83f2ff00079893b8e2dbb2fc5d5b7588435aa4dd))
* refuse to serve or write inside a ref, as every other command does ([665b2de](https://github.com/hajimism/dek/commit/665b2de7a3e6aa3b67ce6140d3eb2a15fb398ee6))
* serve a deck's assets only from inside the project ([86743cf](https://github.com/hajimism/dek/commit/86743cf731d97f664e95b75f1441dd238f0eeb11))
* take a folder for a ref only where dek wrote one, and name it from there ([62cc8df](https://github.com/hajimism/dek/commit/62cc8df0a509a99a55d9db7698683bc3be5523d4))
* **theme:** leave layouts whose names are no plain word out of --json ([625f6d3](https://github.com/hajimism/dek/commit/625f6d3dab0dfe16dacb272e371b551214621a86))
* **theme:** print only layout names that are plain words ([62b15d1](https://github.com/hajimism/dek/commit/62b15d18afb91d6adbc2641376d9ca899cb6bf20))


### Documentation

* say dek follows no link under packs/ either ([5a11b2c](https://github.com/hajimism/dek/commit/5a11b2ca9960a134e261f09f80408fc770aa44da))

## [0.3.4](https://github.com/hajimism/dek/compare/v0.3.3...v0.3.4) (2026-10-27)


### Features

* **pptx:** lay out boxes, pictures, text, the theme, and backgrounds as PowerPoint's own ([#27](https://github.com/hajimism/dek/issues/27)) ([eb854e9](https://github.com/hajimism/dek/commit/eb854e9835508792d3e8cfb9dd4046e8750dab7f))
* **skills:** teach the review in the browser, and add an optional dek-design skill ([2c18b0e](https://github.com/hajimism/dek/commit/2c18b0e339160fb03ca6ce3915b89e37d82c9522))
* **skills:** teach the review in the browser, and add an optional dek-design skill ([1b04394](https://github.com/hajimism/dek/commit/1b04394023a239706a2fa29d168811e1a1be05d2))
* **visual:** report awkward line breaks and edges a few pixels off (DEK035, DEK036) ([#28](https://github.com/hajimism/dek/issues/28)) ([ce75fc1](https://github.com/hajimism/dek/commit/ce75fc14937d76ab457298a5aca9116a0fe3778e))


### Bug Fixes

* refuse a slide script's imports before Bun reads it, so none runs while dek compiles ([2752356](https://github.com/hajimism/dek/commit/275235647869f1e0a040c080476141d3aaa1aaa6))
* refuse a slide script's imports before Bun reads it, so none runs while dek compiles ([198930c](https://github.com/hajimism/dek/commit/198930c1d41639cc9943f36a3a187ff6eab0f364))


### Documentation

* **adr:** keep dependency code away from the tokens that publish ([103f17c](https://github.com/hajimism/dek/commit/103f17cebb37dd1750caa4cc242acedf55703809))
* **adr:** renumber the PPTX records after the line-break ones ([ca43352](https://github.com/hajimism/dek/commit/ca4335267b6eeed7131c4123a8a543a230d65875))
* **adr:** renumber the PPTX records after the line-break ones ([bef6e12](https://github.com/hajimism/dek/commit/bef6e12915ac301843297fb972cf36288bbf612c))
* **adr:** ship an optional design skill and raise the official skill's floor to 0.2.2 ([6f39dd1](https://github.com/hajimism/dek/commit/6f39dd1e8234297cb0fb72d93722a419d1921f23))
* name the optional dek-design skill, and the review the official skill teaches ([6908fa1](https://github.com/hajimism/dek/commit/6908fa195e16d79c75d5b77cda72f708798de34c))

## [0.3.3](https://github.com/hajimism/dek/compare/v0.3.2...v0.3.3) (2026-10-21)


### Features

* **new:** start a deck on a ref's theme with `--theme-from <ref>` ([6d0ffc9](https://github.com/hajimism/dek/commit/6d0ffc9c45a54092375ca73e305294e71e005655))
* **new:** start a deck on a ref's theme with `--theme-from <ref>` ([54be6db](https://github.com/hajimism/dek/commit/54be6db71b2521fda1bec3ddb967a4a7545bc36c))
* **pack:** hand a deck over under CC0 1.0 unless dek.toml says otherwise ([b7e2565](https://github.com/hajimism/dek/commit/b7e2565fd83a8d82c8d8416f6ae3551ba5040427))
* **pack:** hand a deck over under CC0 1.0 unless dek.toml says otherwise ([46cd7b9](https://github.com/hajimism/dek/commit/46cd7b9424d9e76570c2e017f2345b41f85506b3))
* **ref:** hand a deck over with `dekc pack` and read it with `dekc ref <file>.tgz` ([9e77bbc](https://github.com/hajimism/dek/commit/9e77bbc7bdf9f2e232c115903c73bf8fa8f078fe))
* **ref:** hand a deck over with `dekc pack` and read it with `dekc ref <file>.tgz` ([a0c67bc](https://github.com/hajimism/dek/commit/a0c67bc8258a2132dd77eadb2b87c838e6e9f866))


### Bug Fixes

* **dev:** leave the Enter and Escape that end a conversion to the input method ([f148c54](https://github.com/hajimism/dek/commit/f148c54377460b4df11e8fedd059554f00c06889))
* **dev:** leave the Enter and Escape that end a conversion to the input method ([e2b3940](https://github.com/hajimism/dek/commit/e2b3940cf48168b5a7c2b95250df982566222b60))


### Documentation

* **adr:** hand a deck over as a pack and read it as a ref ([4b3ffc6](https://github.com/hajimism/dek/commit/4b3ffc6e653757f3976a581acff1a2bf76862748))
* **adr:** start a deck from a ref's theme ([f836941](https://github.com/hajimism/dek/commit/f836941cb2faf9b33faaab63abd16f66878e4767))
* describe packs in the structure guide, the reference, and ADR 15 ([020d4a0](https://github.com/hajimism/dek/commit/020d4a0254138c55e0a78c41e2e28f8a839bf8d1))
* record the pack's license in ADR 16, the guide, and the reference ([a0b4ea7](https://github.com/hajimism/dek/commit/a0b4ea74b6d896d102c1c0e2c06a040b75905962))
* say a deck can start on a ref's theme, in the guides and the reference ([49791ff](https://github.com/hajimism/dek/commit/49791ff46f77e5fd37e9d21f4061669de31af1f9))

## [0.3.2](https://github.com/hajimism/dek/compare/v0.3.1...v0.3.2) (2026-10-20)


### Bug Fixes

* **pdf:** print each slide as a picture with its text laid over it ([02f49a8](https://github.com/hajimism/dek/commit/02f49a855209e1c4430613fd9358699305bcbb9b))
* **pdf:** print each slide as a picture with its text laid over it ([b88259d](https://github.com/hajimism/dek/commit/b88259dbcc80ed0a1450cc6bf6422c71120c5802))


### Performance

* **pdf:** keep a slide of photographs as a JPEG ([19a9092](https://github.com/hajimism/dek/commit/19a909214b256c8bbcf66a443f00c54c2b43766e))


### Documentation

* record the PDF as pictures in ADR 14 and the presenting guide ([c889781](https://github.com/hajimism/dek/commit/c88978175a9b3812f611d8af4de94b2de57556c1))
* say which slides the PDF keeps as JPEGs, in ADR 14 and the guide ([de733fb](https://github.com/hajimism/dek/commit/de733fb4589d5f6f45f6f9a83b60673d2feab706))

## [0.3.1](https://github.com/hajimism/dek/compare/v0.3.0...v0.3.1) (2026-10-08)


### Performance

* **build:** leave the dev server's line out of built files ([1e74ba0](https://github.com/hajimism/dek/commit/1e74ba0fb2512eeecf8ca4ba13a747374b1a651c))
* **build:** leave the dev server's line out of built files ([93bb4fc](https://github.com/hajimism/dek/commit/93bb4fc56105940cc5b19dc86f890dc9246df850))

## [0.3.0](https://github.com/hajimism/dek/compare/v0.2.2...v0.3.0) (2026-10-07)


### ⚠ BREAKING CHANGES

* a DEK_ variable kept in a project's .env, such as DEK_VOICE_URL, no longer applies; set it in the shell, or use `engine` in voice.toml.
* reading a private ref needs GITHUB_TOKEN or GH_TOKEN; being signed in to gh is not enough, and DEK_GH is gone. `GITHUB_TOKEN=$(gh auth token) dekc ref ...` does what dek did before. No token is sent to DEK_GITHUB_API.

### Bug Fixes

* draw pages in Chromium's sandbox with the network off ([550cc3a](https://github.com/hajimism/dek/commit/550cc3ab1c44005d4ef89420d3bb92a44a7da3a9))
* ignore what the .env.*.local files set, and NODE_TLS_REJECT_UNAUTHORIZED from any .env ([da02b7c](https://github.com/hajimism/dek/commit/da02b7c4375b41ddd9ea2d879714950e5017cbc2))
* keep a ref's title to one line of AGENTS.md ([c1b0b60](https://github.com/hajimism/dek/commit/c1b0b609a8710985c32988cff19b8cb65a0e6bc6))
* run dekc, and every bun it starts, without the working directory's bunfig.toml ([0418909](https://github.com/hajimism/dek/commit/04189098b6975ba37506f039e865388205c5817b))
* ship tsconfig.json, so a project's paths cannot take over dek's imports ([3eed8f0](https://github.com/hajimism/dek/commit/3eed8f0961a232a48be1cb06cd08dc03e121d026))
* stop asking gh for a token, and send one only to api.github.com ([62c896b](https://github.com/hajimism/dek/commit/62c896ba1b69424e5426534040a087a2d42bef1a))
* take DEK_ variables only from the environment, never from a .env ([7f4629b](https://github.com/hajimism/dek/commit/7f4629b3099e23a4c46b6261fa95627659fbfe51))


### Documentation

* **adr:** number the GHSA-mj6q-67q7-q923 decision after the ones on main ([4a888b0](https://github.com/hajimism/dek/commit/4a888b06594c188bf0efa88fb9111f48f70263e9))
* **adr:** take GitHub tokens and DEK_ variables only from what the user sets ([c07fa4c](https://github.com/hajimism/dek/commit/c07fa4ceb7e1df69fb184ee8955f1819ee58a069))
* record the ref title and shot fixes in ADR 12 and the architecture guide ([a6bfb93](https://github.com/hajimism/dek/commit/a6bfb9383c9c614c5c39f0e2f6817db24dc83e06))
* say what a project cannot set for the Bun that runs dek, and what stays out of scope ([632efbb](https://github.com/hajimism/dek/commit/632efbbe4697a2175bf9cd0c8b5db77e53dbfa17))

## [0.2.2](https://github.com/hajimism/dek/compare/v0.2.1...v0.2.2) (2026-10-06)


### Features

* **agents:** generate llms.txt and ship the official dek skill ([79d8abe](https://github.com/hajimism/dek/commit/79d8abea5d3c8822a865e2e58b687ec898e9f729))
* **agents:** generate llms.txt and ship the official dek skill ([b9b66ba](https://github.com/hajimism/dek/commit/b9b66ba43b556e35738a66ed492ad699556573ce))
* **dev:** keep annotations in .dek/ and list them with dekc annotations ([e22671f](https://github.com/hajimism/dek/commit/e22671f2816b517c62b827ca111aadd2edc02dfe))
* **dev:** keep annotations in .dek/ and list them with dekc annotations ([10195e3](https://github.com/hajimism/dek/commit/10195e3060d5754d36e91f5276b9964ed620ccb8))
* **lint:** keep runtime state classes out of a theme's vocabulary and slide markup ([83fd36c](https://github.com/hajimism/dek/commit/83fd36c8d2312c709d939bdc2e344d906b13ff82))
* **lint:** require every picture to say what it shows (DEK034) ([95ebbc2](https://github.com/hajimism/dek/commit/95ebbc2830b67a13288709d593b7d39c006ea806))
* **lint:** require every picture to say what it shows (DEK034) ([9926f4b](https://github.com/hajimism/dek/commit/9926f4b22c3d9be1abf6fd8681fdc101383c11b3))
* **pptx:** export a talk as PPTX with editable text over each slide ([12c2ec2](https://github.com/hajimism/dek/commit/12c2ec21b67e0b713e326d9300eff787a5a8ed16))
* **pptx:** export a talk as PPTX with editable text over each slide ([46d5468](https://github.com/hajimism/dek/commit/46d54686e5ce60d4718015a964791401a2345b3b))


### Bug Fixes

* **agents:** write the agent guidance as what the checks and commands do ([97447ca](https://github.com/hajimism/dek/commit/97447cabf543c66cc6231b9b0e5a2378d7060615))

## [0.2.1](https://github.com/hajimism/dek/compare/v0.2.0...v0.2.1) (2026-10-06)


### Features

* **dev:** annotate slide elements and copy the notes for an agent ([8565bd5](https://github.com/hajimism/dek/commit/8565bd5a8d385a84c10d4fa78cab1b7460a86389))


### Documentation

* **sample:** show annotate mode on a roadmap in with-agents ([c1d9c4c](https://github.com/hajimism/dek/commit/c1d9c4c6ddd6306748bdd5544b868fbf3d170a6c))

## [0.2.0](https://github.com/hajimism/dek/compare/v0.1.0...v0.2.0) (2026-10-01)


### ⚠ BREAKING CHANGES

* max_classes, cjk_per_minute and latin_per_minute in dek.toml no longer apply to existing decks. Add them to each deck's script.md frontmatter to keep them; lint's DEK008 names each one.

### Features

* let a deck own its class budget and speaking rate ([8dc9a07](https://github.com/hajimism/dek/commit/8dc9a07efb32b803e685a353ee628cae21a8bc56))


### Bug Fixes

* **lint:** count vbscript: and script-running data: URLs in DEK011 ([1b825b1](https://github.com/hajimism/dek/commit/1b825b1bffc33809ef0bdf3a8e5a1d45794a41a7))

## 0.1.0 (2026-10-01)

The first release on npm.

### Features

* Published as `@hajimism/dek`. Create a project with `bunx @hajimism/dek init`, then install it with `bun add -d @hajimism/dek`.

### ⚠ BREAKING CHANGES

* The command is `dekc`, not `dek`. `dek` on npm is an unrelated package, and `bunx dek` ran it anywhere dek was not installed. Run `bunx dekc` inside a project; the package, `dek.toml`, `.dek/`, and the `DEK` lint codes keep their names.
