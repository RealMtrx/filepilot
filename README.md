# FilePilot

> **Alpha software.** FilePilot is under active development and is **not
> production-ready**. It moves real files on your machine, so please try it on
> copies of unimportant data first, and keep every sensitive operation in
> dry-run mode (which is the default) until you are comfortable with the
> output.

Local-first file analysis and organization for your device.

FilePilot scans, classifies and organizes files with a fast, safe engine and a
professional terminal UI. Everything runs on your machine — no accounts, no
cloud, no API keys, and no data ever leaves your computer.

## What works today

- Recursive scanning with gitignore-style ignore patterns, symlink-loop
  protection and cooperative cancellation
- File classification into 13 categories (images, videos, audio, documents,
  archives, installers, code, projects, fonts, databases, backups, temporary,
  other) by extension with magic-byte fallback
- Duplicate detection (size → fast hash → full hash) without loading files
  into memory
- Disk analysis: totals, largest files, largest folders, per-category sizes
- Safe file organizing (see below)

## Safety first

FilePilot treats your files as precious:

- **Dry-run is the default.** `organize` only prints what would happen; it
  creates, moves and deletes nothing unless you explicitly confirm.
- **Nothing is ever deleted permanently** by the organizer.
- **Nothing is ever overwritten.** If a destination already exists, the move
  fails and the source stays untouched.
- **Applying a plan requires an explicit confirmation** (`--apply --yes`).
- Sources and destinations are re-checked before every move; a single failing
  file never aborts the rest of the plan.
- Software projects are detected and never split apart.
- Symlinks are moved as links; moves that would escape the destination root
  through a symlink are refused.
- Every applied move is journaled before the next one starts, so interrupted
  runs leave a recoverable trail (Undo & History is coming).

## Requirements

- Node.js >= 20.19
- Windows, Linux or macOS

## Installation

```bash
npm install -g filepilot-cli
```

This provides the `filepilot` command. You can also run it without installing:

```bash
npx filepilot-cli --help
```

## Usage

```bash
filepilot --help          # general help
filepilot organize <dir>  # dry run: print the organization plan
```

Example dry run:

```text
$ filepilot organize ~/Downloads

Organization Plan

Archives/
  backup.zip

Documents/
  invoice.pdf

Images/
  photo.png
  screenshot.jpg

Planned: 4 moves
Conflicts: 0
Skipped: 0

/home/me/Downloads/backup.zip → /home/me/Downloads/Archives/backup.zip
/home/me/Downloads/invoice.pdf → /home/me/Downloads/Documents/invoice.pdf
/home/me/Downloads/photo.png → /home/me/Downloads/Images/photo.png
/home/me/Downloads/screenshot.jpg → /home/me/Downloads/Images/screenshot.jpg

Total size to move: 14.2 MB

Dry run: no files were created, moved or deleted.
Re-run with --apply --yes to execute this plan.
```

Only when you have reviewed the plan and want to execute it:

```bash
filepilot organize ~/Downloads --apply --yes
```

## Development

```bash
npm install
npm run typecheck   # TypeScript
npm run lint        # ESLint
npm run test        # Vitest
npm run build       # tsup
```

## License

MIT — see [LICENSE](LICENSE).
