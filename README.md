# MyHitster

A browser-based music guessing game inspired by Hitster. Scan a QR code to hear a 30-second mystery track and guess the song — no Spotify Premium, no accounts required.

## How it works

1. **Generate a card deck** — import tracks from a Deezer playlist, search iTunes for an album or artist, or paste a track list manually. The card generator matches each song to a 30-second iTunes preview and produces a printable double-sided PDF.
2. **Print and play** — cut out the cards. Each card has a QR code on the front and the artist, title, and year on the back.
3. **Scan to play** — players scan a QR code with any device. The mystery track plays instantly in the browser with no login needed.

## Features

- **Deezer playlist import** — paste any public Deezer playlist URL to import all tracks automatically
- **iTunes album/artist search** — search directly for an album or artist to build a deck
- **CSV/manual import** — upload an Exportify CSV or paste tracks as `Artist - Title`
- **30-second previews** — audio via iTunes Search API, no account required
- **QR code scanning** — uses device camera via jsQR
- **Printable PDF** — double-sided layout with QR codes on the front and song info on the back; print with *Flip on short edge*
- **MusicBrainz verification** — optional cross-check of release dates against MusicBrainz
- **Year range filter** — highlights tracks outside a chosen decade for review

## Requirements

- A modern browser (Chrome, Firefox, Safari, Edge)
- Camera access for QR scanning
- HTTPS for camera and crypto APIs (GitHub Pages works out of the box)

## File structure

```
/
├── index.html              Player page (scan QR → hear track)
├── card-generator.html     Card deck generator
├── css/
│   ├── shared.css
│   ├── index.css
│   └── card-generator.css
├── js/
│   ├── api/
│   │   ├── deezer.js           Deezer playlist fetching
│   │   ├── itunes.js           iTunes search and preview matching
│   │   └── musicbrainz.js      MusicBrainz release-date lookup
│   ├── backend/
│   │   ├── supabase.js         Supabase client singleton (null when unconfigured)
│   │   ├── auth.js             Auth widget and state (optional)
│   │   ├── decks.js            Deck save/load/share (optional)
│   │   └── config.example.js   Template — copy to config.js and fill in credentials
│   ├── core/
│   │   ├── card-generator.js   Orchestrates deck building and UI
│   │   ├── player.js           Audio playback via iTunes preview URLs
│   │   ├── scanner.js          QR code scanning via jsQR
│   │   ├── parser.js           CSV and manual track-list parsing
│   │   └── pdf.js              PDF generation (returns blob + triggers download)
│   └── ui/
│       ├── theme.js            Dark/light theme toggle
│       └── ux.js               Shared UI helpers
└── tests/
    ├── player.spec.js
    ├── generator.spec.js
    └── auth.spec.js
```

## QR code format

Each QR code encodes a URL of the form:

```
https://wilgoy23.github.io/MyHitster/index.html?id=HASH&preview=BASE64URL
```

- `id` — first 12 hex characters of the SHA-256 hash of the preview URL
- `preview` — base64url-encoded iTunes 30-second preview MP3 URL

## Running locally

```bash
python -m http.server 8080
# open http://localhost:8080/card-generator.html
```

## Running tests

```bash
npm install
npx playwright install --with-deps chromium
npm test
```
