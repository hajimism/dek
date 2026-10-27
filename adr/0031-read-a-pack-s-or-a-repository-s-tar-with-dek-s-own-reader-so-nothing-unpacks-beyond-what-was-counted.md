# 31. Read a pack's or a repository's tar with dek's own reader, so nothing unpacks beyond what was counted

Date: 2026-10-27

## Status

Accepted

Amends [15. Hand a deck over as a pack and read it as a ref](0015-hand-a-deck-over-as-a-pack-and-read-it-as-a-ref.md)

## Context

A pack is a gzipped tar because Bun's `Bun.Archive` reads and writes tar, and [ADR 15](0015-hand-a-deck-over-as-a-pack-and-read-it-as-a-ref.md) rules out zip because dek "would need a zip reader, a new parser for files from other people". It reads a pack with limits: the file may be 50 MB, it is gunzipped through a count that stops at 100 MB before any of it is taken apart, and the tar is then read as a GitHub tarball is. Both readings were `Bun.Archive`'s `files()`, which hands the bytes to libarchive and builds a Blob for every file it finds.

That left what libarchive makes of the counted bytes uncounted:

- **GitHub's tarball was not counted at all.** `dekc ref <owner/repo/deck>` capped the download at 200 MB, then let Bun inflate it whole.
- **A gzip inside the gzip.** libarchive inflates a gzip it is handed, so a pack gzipped twice passed the count once and was inflated again without one: 367 bytes, a 1 MB limit, a 64 MB file.
- **Sparse files.** A GNU `S` entry, or a file pax marks sparse with `GNU.sparse.*` records, stores a few bytes and a real size; libarchive fills the holes with zeros. A 2 KB tar gave a 300 MB file, and a real size near the largest a header can name, about 8 GB, ran dek out of memory.

The first fix kept libarchive and put a walk of the tar's headers in front of it, refusing a sparse entry and a nested gzip before Bun saw the bytes. A review found five places where the walk and libarchive read the same bytes differently, each of which let a sparse entry past the walk to libarchive:

- libarchive reads archives one after another (`read_concatenated_archives`), and the walk stopped at the first block of zeros;
- the walk gave a pending pax `size` to the next header even when it was an `L`, `K`, `g`, or `x`, and libarchive gives it to the file after them;
- libarchive skips tabs in a number, and the walk read a tab as the end of it;
- a pax record length such as `+12` or `0xc`, which libarchive refuses along with the `size` after it, the walk read as a number and applied;
- libarchive takes a regular entry named like a folder, `t/d/`, for a folder with no data, and the walk skipped the data it declared.

At the default limits, the first of these took a 129-byte pack to a 300 MB file and dek's memory up by 813 MB. Each could be patched, but the cause is the same each time: two readers of one input, and the one that decides how much memory a file takes is the one dek does not read.

## Decision

**dek reads the tar itself.** The gunzip count stays as it is, and the tar it leaves is in memory; `src/core/tar.ts` reads its headers in order, and each regular file is a copy of the bytes the tar stores for it. What comes out of a tar is never more than the tar, which was counted on the way in. `Bun.Archive` is no longer used to read a tar from someone else; `dekc pack` still writes with it.

**The reader reads what git, GNU tar, bsdtar, and Bun write, and nothing else.**

- Headers are ustar, in POSIX form (`ustar\0` `00`, its prefix placed before its name) or GNU form (`ustar  \0`), with a checksum that adds up, summed as unsigned or as signed bytes.
- A pax `x` header's `path` and `size` belong to the entry after it and to no other; a GNU `L` long name likewise, and a GNU `K` long link name is read and left aside. With both a pax `path` and an `L` name, the later one names the entry, and an empty one leaves the header's name, as `Bun.Archive` named it; a name keeps a byte order mark at its start. A pax `g` header is read and left aside, and may come only between entries.
- Regular files (`0`, `\0`, `7`) are read. Folders (`5`) and hard and symbolic links (`1`, `2`) are skipped, as `Bun.Archive` skipped links, and must declare no data.
- A file whose name's last segment starts with `._` is left out, as `Bun.Archive` left it out: macOS's tar writes a file's extended attributes as an AppleDouble file of that name just before it, so a pack made with `tar czf` on a Mac holds one beside every file that has them, and dek would otherwise read `slides/._intro.html` as a slide.
- Each entry must store all it declares, and the sizes all entries declare may add up to the unpacked limit at most; an entry that declares more than the tar holds is refused as cut short, not as too large. A pack may hold 10,000 headers, a repository's tarball 200,000.
- The tar ends at a block of zeros, and only zeros may follow it.

**Anything else is refused, before any file is made:** a sparse entry, `S` or one pax marks with `GNU.sparse.*`, `SCHILY.realsize`, or `SUN.holesdata`; any other type, a device, a FIFO, or GNU's `D`, `M`, `N`, `V`; a header with neither magic, or whose checksum does not add up; a number with anything but octal digits, spaces before them, and NULs or spaces after, a tab or base 256 included; a pax record whose length is not plain decimal digits, or records that do not fill their header exactly; two `x` or two `L` headers before one entry, a `g` between a header and its entry, or a header left with no entry at the end; a regular file whose name ends in `/`; a name with a NUL in it, or an `L` name or a pax `path` or `linkpath` longer than 4096 bytes, `PATH_MAX`; more headers than the tar may hold; a tar without its end, or with anything but zeros after it, so a second archive is refused rather than half read. A refusal says what dek found, with its path where it has one, on one line and cut at 80 characters: "the pack holds a sparse file (`t/big`), which dek does not read", with the hint to ask for a pack made with `dekc pack <deck>`; for GitHub's tarball, that the repository holds something dek cannot read and to pin the deck from a pack instead. A file that is not a gzipped tar at all, or whose first block is no tar header, still says so.

**A repository may unpack to 1 GB.** A repository of text inflates some 3.5 times, so 1 GB, about five times the 200 MB dek downloads of it, keeps every repository that fit the download before. A pack may still unpack to 100 MB, as ADR 15 says. The snapshot's paths are filtered as ADR 15 says: the top folder dropped, and any path that is absolute, has an empty segment, or climbs with `..` left out.

**What was not chosen:**

- **Patching the walk** for each of the five. It would stay a second reading of bytes libarchive reads its own way, and the next difference between them would be the next way past.
- **Bounding `Bun.Archive`'s output after the fact**, by the sizes of the files it returns. `files()` has filled every hole by the time dek sees a size; the memory is already spent.
- **Reading in a child process under a memory limit.** Bun sets no such limit; it would have to be set per platform, outside Bun, and the files would then come back over a pipe. It contains the damage instead of preventing it.

## Consequences

dek owns a tar reader for files from other people, the parser ADR 15 counted against zip. It is small, it reads only the forms above, and its tests read `git archive`'s tar of a repository, with a pax global header, long paths, links, and UTF-8 names, an empty repository's, and GNU tar's or bsdtar's GNU, pax, and ustar forms, each compared file by file and byte by byte with what `Bun.Archive` read of it. Every construction the review found is refused.

A tar that dek did not write and that falls outside those forms is refused, even where libarchive would have read it: one made by GNU tar with `--sparse`, one with a device or a FIFO in it, one made by a tar older than ustar, or two archives joined into one file. `dekc pack` makes a pack dek reads, and `git archive` makes every tarball GitHub serves.

Reading a tar holds the tar, a copy of its files, and a little for each of its entries, which the cap on headers keeps to 10,000 for a pack and 200,000 for a repository's tarball.

A repository that unpacks to more than 1 GB is refused with the hint to keep decks in a smaller repository or to hand the deck over as a pack.
