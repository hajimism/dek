# Changelog

Release notes for `@hajimism/dek`. From 0.1.0 on, release-please writes this file from the Conventional Commits on `main`.

## [0.3.4](https://github.com/hajimism/dek/compare/v0.3.3...v0.3.4) (2026-10-22)


### Features

* **skills:** teach the review in the browser, and add an optional dek-design skill ([2c18b0e](https://github.com/hajimism/dek/commit/2c18b0e339160fb03ca6ce3915b89e37d82c9522))
* **skills:** teach the review in the browser, and add an optional dek-design skill ([1b04394](https://github.com/hajimism/dek/commit/1b04394023a239706a2fa29d168811e1a1be05d2))


### Documentation

* **adr:** keep dependency code away from the tokens that publish ([103f17c](https://github.com/hajimism/dek/commit/103f17cebb37dd1750caa4cc242acedf55703809))
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
