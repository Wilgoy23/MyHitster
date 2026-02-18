# MyHitster

A browser-based music guessing game that plays mystery Spotify tracks via QR code scanning.

## Overview

MyHitster lets players scan a QR code to load a hidden Spotify track and guess what it is. It uses the Spotify Web Playback SDK to stream audio directly in the browser, with no backend required.

## Features

- QR code scanning via device camera to load tracks
- Spotify authentication using PKCE (no client secret needed)
- In-browser audio playback through the Spotify Web Playback SDK
- Mobile support with manual player activation step
- Account checker page for debugging premium status and player access

## Requirements

- A Spotify Premium account (required by the Spotify Web Playback SDK)
- A modern browser with camera access for QR scanning
- The app must be served over HTTPS for camera and crypto APIs to work

## Setup

1. Register an app at [developer.spotify.com](https://developer.spotify.com) and note your Client ID.
2. Add your redirect URI (e.g. `https://yourdomain.com/callback.html`) to the app's allowed redirect URIs.
3. Update `CLIENT_ID` and `REDIRECT_URI` in `js/spotify-auth.js`.
4. Deploy the files to any static hosting service.

## File Structure

```
/
├── index.html            Main player page
├── account-checker.html  Debug page for checking Spotify account status
├── callback.html         OAuth redirect handler
├── css/
│   ├── shared.css
│   ├── index.css
│   └── account-checker.css
└── js/
    ├── spotify-auth.js   Auth, token management, PKCE helpers
    ├── player.js         Spotify SDK player logic
    ├── scanner.js        QR code scanning via jsQR
    └── account-checker.js
```

## Generating QR Codes

QR codes should encode a URL with the following parameters:

- `track` - Base64url-encoded Spotify track URI (e.g. `spotify:track:XXXXXX`)
- `id` - Optional display identifier for the mystery track

The Python script `card_generator.py` can be used to generate these QR codes.

## Notes

- The Spotify Web Playback SDK will not work on free accounts.
- On mobile, users must tap "Activate Player" before playback can begin due to browser autoplay restrictions.