# Agent Integration Guide - ballcam-agent Live Streaming

This guide explains how to integrate the ballcam-agent with the ballcam.tv live streaming backend.

## Overview

The live streaming system uses Socket.IO over the `/live` namespace. The agent acts as a **broadcaster**, sending game snapshots at 30 FPS. Viewers connect anonymously to watch the stream.

## Connection Flow

```
1. Agent initiates Device Auth flow to obtain JWT token
2. User authorizes agent on ballcam.tv/device
3. Agent receives access_token and refresh_token
4. Agent connects to /live namespace with JWT
5. Agent emits 'broadcast-start' to create session
6. Backend returns sessionId + shareUrl
7. Agent shows shareUrl to user (for sharing)
8. Agent emits 'broadcast-snapshot' at 30 FPS with binary data
9. On game end/user stop, agent emits 'broadcast-stop'
10. Backend cleans up session and notifies viewers
```

## Authentication: Device Auth Flow (RFC 8628)

The agent uses the Device Authorization Grant flow to obtain a JWT token. This allows the agent to authenticate without requiring the user to enter credentials in the agent itself.

### Step 1: Request Device Code

```bash
POST https://ballcam.tv/api/auth/device/code
Content-Type: application/json

{
  "client_id": "ballcam-agent",
  "device_name": "My Gaming PC"
}
```

**Response:**
```json
{
  "device_code": "GmRhmhcxhwAzkoEqiMEg_DnyEysNkuNhszIySk9eS",
  "user_code": "ABCD-1234",
  "verification_uri": "https://ballcam.tv/device",
  "expires_in": 1800,
  "interval": 5
}
```

### Step 2: Display to User

Show the user:
```
To authorize ballcam-agent:
1. Go to: https://ballcam.tv/device
2. Enter code: ABCD-1234
```

### Step 3: Poll for Token

Poll every `interval` seconds until authorized:

```bash
POST https://ballcam.tv/api/auth/device/token
Content-Type: application/json

{
  "device_code": "GmRhmhcxhwAzkoEqiMEg_DnyEysNkuNhszIySk9eS",
  "client_id": "ballcam-agent"
}
```

**Pending Response (keep polling):**
```json
{
  "error": "authorization_pending",
  "error_description": "The authorization request is still pending"
}
```

**Success Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "device_id": "uuid-of-authorized-device"
}
```

### Step 4: Store and Refresh Tokens

- Store `access_token`, `refresh_token`, and `device_id` securely
- Access token expires in 1 hour
- Use `POST /api/auth/device/refresh` with `device_id` to get a new access token

## Socket.IO Connection

### Endpoint
```
wss://ballcam.tv/live
```

### Authentication
The broadcaster MUST authenticate with a JWT token in the auth handshake:

```typescript
import { io } from 'socket.io-client';

const socket = io('https://ballcam.tv/live', {
  auth: {
    token: accessToken, // JWT from Device Auth flow
    role: 'broadcaster',
  },
  transports: ['websocket'],
});
```

### Connection Events
```typescript
socket.on('connect', () => {
  console.log('Connected to /live namespace');
});

socket.on('connect_error', (error) => {
  console.error('Connection failed:', error.message);
  // Handle auth errors: 'Invalid or expired token'
});

socket.on('disconnect', (reason) => {
  console.log('Disconnected:', reason);
  // Handle reconnection if needed
});
```

## Events

### 1. broadcast-start

Start a new broadcast session.

**Emit:**
```typescript
socket.emit('broadcast-start', {
  visibility: 'public' | 'unlisted',  // optional, default: 'public'
  environmentId: '<uuid>',             // optional, environment UUID
}, (response) => {
  if (response.success) {
    console.log('Session ID:', response.sessionId);  // 12-char alphanumeric
    console.log('Share URL:', response.shareUrl);     // https://ballcam.tv/live/ABC123DEF456
  } else {
    console.error('Failed:', response.error);
  }
});
```

**Response:**
```typescript
// Success
{ success: true, sessionId: 'ABC123DEF456', shareUrl: 'https://ballcam.tv/live/ABC123DEF456' }

// Error
{ success: false, error: 'ALREADY_BROADCASTING' | 'RATE_LIMIT_EXCEEDED' | string }
```

### 2. broadcast-snapshot

Send a game state snapshot. Must be binary (ArrayBuffer).

**Emit:**
```typescript
const snapshotBuffer: ArrayBuffer = encodeSnapshot(snapshot);
socket.emit('broadcast-snapshot', snapshotBuffer);
// No callback - fire and forget for performance
```

**Rate Limit:** 35 snapshots/second (silent drop if exceeded)

### 3. broadcast-stop

Stop the broadcast gracefully.

**Emit:**
```typescript
socket.emit('broadcast-stop', (response) => {
  if (response.success) {
    console.log('Broadcast stopped');
  } else {
    console.error('Failed:', response.error);
  }
});
```

### 4. set-environment (optional)

Change the environment during broadcast.

**Emit:**
```typescript
socket.emit('set-environment', { environmentId: '<uuid>' }, (response) => {
  if (response.success) {
    console.log('Environment changed');
  }
});
```

### 5. set-visibility (optional)

Change visibility during broadcast.

**Emit:**
```typescript
socket.emit('set-visibility', { visibility: 'public' | 'unlisted' }, (response) => {
  if (response.success) {
    console.log('Visibility changed');
  }
});
```

## Binary Snapshot Format

The snapshot must be encoded in the custom binary format. Here is the specification:

### Header (2 bytes)
| Offset | Size | Description |
|--------|------|-------------|
| 0 | 1 | Magic byte: 0x4C ('L') |
| 1 | 1 | Version: 3 (current) |

**Version History:**
- v1: Initial version
- v2: Added `isDemolished` flag to CarState
- v3: Added `demolishedBy` attacker info when demolished

### Timestamp (8 bytes)
| Offset | Size | Description |
|--------|------|-------------|
| 2 | 8 | Float64 LE - Unix timestamp in milliseconds |

### Ball State (53 bytes)
| Offset | Size | Description |
|--------|------|-------------|
| 10 | 12 | position: Vector3 (3x Float32 LE) |
| 22 | 12 | velocity: Vector3 (3x Float32 LE) |
| 34 | 16 | rotation: Quaternion (4x Float32 LE) |
| 50 | 12 | angularVelocity: Vector3 (3x Float32 LE) |
| 62 | 1 | lastTouchTeam: 0=Blue, 1=Orange, 255=None |

### Cars Array
| Offset | Size | Description |
|--------|------|-------------|
| 63 | 1 | carCount: Uint8 |

**For each car (~65-100 bytes depending on name lengths):**
| Size | Description |
|------|-------------|
| 1 + N | name: LengthPrefixedString (Uint8 length + UTF-8 bytes) |
| 1 | team: Uint8 (0=Blue, 1=Orange) |
| 1 | isLocal: Uint8 (0=false, 1=true) |
| 1 + N | platformId: LengthPrefixedString |
| 1 + N | platform: LengthPrefixedString ('steam', 'epic', 'ps4', 'xbox', 'switch') |
| 12 | position: Vector3 |
| 12 | velocity: Vector3 |
| 16 | rotation: Quaternion |
| 1 | boost: Uint8 (0-100) |
| 1 | flags: Uint8 bitfield (see below) |
| 0-50 | demolishedBy: AttackerInfo (only if isDemolished=true, see below) |

**Flags bitfield:**
| Bit | Description |
|-----|-------------|
| 0 | isBoosting |
| 1 | isOnGround |
| 2 | isSupersonic |
| 3 | isDemolished (v2+) |

**AttackerInfo (only written when isDemolished=true, v3+):**
| Size | Description |
|------|-------------|
| 1 | hasAttacker: Uint8 (0=unknown, 1=has attacker info) |

If hasAttacker=1:
| Size | Description |
|------|-------------|
| 1 + N | platformId: LengthPrefixedString |
| 1 + N | platform: LengthPrefixedString |
| 1 + N | name: LengthPrefixedString |

### Boost Pads Array
| Offset | Size | Description |
|--------|------|-------------|
| ... | 1 | boostPadCount: Uint8 |

**For each boost pad (2 bytes):**
| Size | Description |
|------|-------------|
| 1 | id: Uint8 (0-101) |
| 1 | isAvailable: Uint8 (0=false, 1=true) |

### Game Info
| Size | Description |
|------|-------------|
| 4 | timeRemaining: Float32 LE (seconds) |
| 1 | scoreBlue: Uint8 |
| 1 | scoreOrange: Uint8 |
| 1 | flags: Uint8 bitfield (bit0=isOvertime, bit1=isRoundActive) |
| 1+ | lastScorer: see below |

**LastScorer:**
| Size | Description |
|------|-------------|
| 1 | hasScorer: Uint8 (0=no, 1=yes) |

If hasScorer=1:
| Size | Description |
|------|-------------|
| 1 + N | platformId: LengthPrefixedString |
| 1 + N | platform: LengthPrefixedString |
| 1 + N | name: LengthPrefixedString |

## TypeScript Types

```typescript
interface LiveSnapshot {
  timestamp: number;  // Date.now()
  ball: BallState;
  cars: CarState[];
  boostPads?: BoostPadState[];  // Optional, can omit if unchanged
  gameInfo: GameInfo;
}

interface BallState {
  position: Vector3;
  velocity: Vector3;
  rotation: Quaternion;
  angularVelocity: Vector3;
  lastTouchTeam: 0 | 1 | null;  // Blue, Orange, or None
}

interface AttackerInfo {
  platformId: string;
  platform: string;
  name: string;
}

interface CarState {
  name: string;
  team: 0 | 1;
  isLocal: boolean;  // true for the agent's player
  platformId: string;
  platform: 'steam' | 'epic' | 'ps4' | 'xbox' | 'switch';
  position: Vector3;
  velocity: Vector3;
  rotation: Quaternion;
  boost: number;  // 0-100
  isBoosting: boolean;
  isOnGround: boolean;
  isSupersonic: boolean;
  isDemolished: boolean;  // v2+: true when car is demolished (waiting to respawn)
  demolishedBy: AttackerInfo | null;  // v3+: who demolished this car (null if unknown)
}

interface BoostPadState {
  id: number;  // 0-101
  isAvailable: boolean;
}

interface GameInfo {
  timeRemaining: number;  // seconds
  scoreBlue: number;
  scoreOrange: number;
  isOvertime: boolean;
  isRoundActive: boolean;
  lastScorer: LastScorerInfo | null;
}

interface LastScorerInfo {
  platformId: string;
  platform: string;
  name: string;
}

interface Vector3 { x: number; y: number; z: number; }
interface Quaternion { x: number; y: number; z: number; w: number; }
```

## Reference Implementation (Encoder)

```typescript
// Reference encoder - adapt to your language as needed
class BinaryWriter {
  private buffer: ArrayBuffer;
  private view: DataView;
  private offset: number = 0;

  constructor(size: number = 2048) {
    this.buffer = new ArrayBuffer(size);
    this.view = new DataView(this.buffer);
  }

  writeUint8(v: number) { this.view.setUint8(this.offset++, v); }
  writeUint32(v: number) { this.view.setUint32(this.offset, v, true); this.offset += 4; }
  writeFloat32(v: number) { this.view.setFloat32(this.offset, v, true); this.offset += 4; }
  writeFloat64(v: number) { this.view.setFloat64(this.offset, v, true); this.offset += 8; }

  writeString(s: string) {
    const bytes = new TextEncoder().encode(s);
    this.writeUint8(bytes.length);
    new Uint8Array(this.buffer, this.offset, bytes.length).set(bytes);
    this.offset += bytes.length;
  }

  writeVector3(v: Vector3) {
    this.writeFloat32(v.x);
    this.writeFloat32(v.y);
    this.writeFloat32(v.z);
  }

  writeQuaternion(q: Quaternion) {
    this.writeFloat32(q.x);
    this.writeFloat32(q.y);
    this.writeFloat32(q.z);
    this.writeFloat32(q.w);
  }

  getBuffer(): ArrayBuffer {
    return this.buffer.slice(0, this.offset);
  }
}

function encodeSnapshot(snapshot: LiveSnapshot): ArrayBuffer {
  const w = new BinaryWriter();

  // Header
  w.writeUint8(0x4C);  // Magic 'L'
  w.writeUint8(3);     // Version 3

  // Timestamp
  w.writeFloat64(snapshot.timestamp);

  // Ball
  w.writeVector3(snapshot.ball.position);
  w.writeVector3(snapshot.ball.velocity);
  w.writeQuaternion(snapshot.ball.rotation);
  w.writeVector3(snapshot.ball.angularVelocity);
  w.writeUint8(snapshot.ball.lastTouchTeam === null ? 255 : snapshot.ball.lastTouchTeam);

  // Cars
  w.writeUint8(snapshot.cars.length);
  for (const car of snapshot.cars) {
    w.writeString(car.name);
    w.writeUint8(car.team);
    w.writeUint8(car.isLocal ? 1 : 0);
    w.writeString(car.platformId);
    w.writeString(car.platform);
    w.writeVector3(car.position);
    w.writeVector3(car.velocity);
    w.writeQuaternion(car.rotation);
    w.writeUint8(car.boost);

    // v3: Flags with isDemolished
    const flags =
      (car.isBoosting ? 1 : 0) |
      (car.isOnGround ? 2 : 0) |
      (car.isSupersonic ? 4 : 0) |
      (car.isDemolished ? 8 : 0);
    w.writeUint8(flags);

    // v3: If demolished, encode attacker info
    if (car.isDemolished) {
      if (car.demolishedBy) {
        w.writeUint8(1);  // hasAttacker = true
        w.writeString(car.demolishedBy.platformId);
        w.writeString(car.demolishedBy.platform);
        w.writeString(car.demolishedBy.name);
      } else {
        w.writeUint8(0);  // hasAttacker = false (unknown attacker)
      }
    }
  }

  // Boost pads
  const pads = snapshot.boostPads || [];
  w.writeUint8(pads.length);
  for (const pad of pads) {
    w.writeUint8(pad.id);
    w.writeUint8(pad.isAvailable ? 1 : 0);
  }

  // Game info
  w.writeFloat32(snapshot.gameInfo.timeRemaining);
  w.writeUint8(snapshot.gameInfo.scoreBlue);
  w.writeUint8(snapshot.gameInfo.scoreOrange);
  const gameFlags = (snapshot.gameInfo.isOvertime ? 1 : 0) | (snapshot.gameInfo.isRoundActive ? 2 : 0);
  w.writeUint8(gameFlags);

  const scorer = snapshot.gameInfo.lastScorer;
  if (scorer) {
    w.writeUint8(1);
    w.writeString(scorer.platformId);
    w.writeString(scorer.platform);
    w.writeString(scorer.name);
  } else {
    w.writeUint8(0);
  }

  return w.getBuffer();
}
```

## Expected Snapshot Size

For a typical 6-player game:
- Header: 2 bytes
- Timestamp: 8 bytes
- Ball: 53 bytes
- 6 cars: ~450 bytes (avg 75 bytes each)
- Boost pads: ~205 bytes (102 pads * 2 bytes + count)
- Game info: ~30 bytes

**Total: ~750 bytes per snapshot**

At 30 FPS = ~22 KB/s bandwidth requirement per viewer.

## Integration Checklist

- [ ] Implement Device Auth flow (`/api/auth/device/code` → `/api/auth/device/token`)
- [ ] Store tokens securely (access_token, refresh_token, device_id)
- [ ] Implement token refresh before expiry
- [ ] Connect to `wss://ballcam.tv/live` with auth token
- [ ] On game start, emit `broadcast-start` and display shareUrl to user
- [ ] Every 33ms (30 FPS), encode snapshot with v3 protocol and emit `broadcast-snapshot`
- [ ] Track `isDemolished` state transitions for demolition events
- [ ] Include `demolishedBy` attacker info when a demolition occurs
- [ ] On game end or user request, emit `broadcast-stop`
- [ ] Handle `disconnect` event for reconnection
- [ ] Handle `connect_error` for auth refresh (re-authenticate if token expired)

## Error Handling

### Socket.IO Errors

| Error | Meaning | Action |
|-------|---------|--------|
| `ALREADY_BROADCASTING` | User already has an active session | Stop existing or wait |
| `RATE_LIMIT_EXCEEDED` | Too many requests | Slow down |
| `NO_ACTIVE_SESSION` | Session expired/not found | Restart broadcast |
| `SESSION_NOT_FOUND` | Invalid sessionId | Check URL |
| `Invalid or expired token` | JWT expired | Refresh token via Device Auth and reconnect |
| `AUTHENTICATION_REQUIRED` | No token provided | Run Device Auth flow |

### Device Auth Errors

| Error | Meaning | Action |
|-------|---------|--------|
| `authorization_pending` | User hasn't authorized yet | Keep polling |
| `slow_down` | Polling too fast | Increase interval by 5 seconds |
| `expired_token` | Device code expired | Start over with new device code |
| `access_denied` | User denied authorization | Inform user and retry |
| `invalid_client` | Bad client_id | Check client_id value |

## Testing Locally

1. Start the backend: `docker compose up -d`
2. Get a JWT token by logging in
3. Connect to `ws://localhost:3000/live`
4. Follow the broadcast flow above
5. Open `http://localhost:5173/live/<sessionId>` to view

## Questions?

Refer to the contracts at `specs/027-live-viewer/contracts/` for full specifications:
- `socket-events.md` - All Socket.IO events
- `api-endpoints.md` - REST API endpoints
- `binary-protocol.md` - Binary encoding details
