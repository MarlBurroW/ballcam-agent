# BallCam Agent

Desktop application for automatically uploading Rocket League replays to [BallCam.tv](https://ballcam.tv).

## Features

- **Auto-upload** - Monitors your Rocket League replay folder and uploads new replays automatically
- **System tray** - Runs silently in the background
- **Desktop notifications** - Get notified when uploads complete
- **Upload history** - View all your uploaded replays
- **Visibility control** - Set replays as public or unlisted by default

## Download

Download the latest installer from the [Releases](https://github.com/ballcam/ballcam-agent/releases) page.

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://rustup.rs/) (latest stable)
- [Tauri CLI](https://tauri.app/v1/guides/getting-started/prerequisites)

### Setup

```bash
# Install dependencies
npm install

# Run in development mode
npm run tauri dev
```

### Build

```bash
# Build for production
npm run tauri build
```

Installers will be generated in `src-tauri/target/release/bundle/`.

## Tech Stack

- **Frontend**: React, TypeScript, Tailwind CSS
- **Backend**: Rust, Tauri v2
- **Build**: Vite

## License

MIT
