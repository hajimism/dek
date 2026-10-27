# Changelog

Release notes for `@hajimism/dek`. From 0.1.0 on, release-please writes this file from the Conventional Commits on `main`.

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
