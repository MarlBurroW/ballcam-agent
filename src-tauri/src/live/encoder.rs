//! Binary snapshot encoding for live streaming to ballcam.tv
//!
//! Encodes game state snapshots in the binary format expected by the backend.
//! See specs/004-live-streaming/contracts/binary-format.md for specification.

use bytes::{BufMut, BytesMut};
use crate::types::{CarSnapshot, GameInfo, GameSnapshot, Quaternion, Vector3};

/// Magic byte for live snapshot format
const MAGIC_BYTE: u8 = 0x4C; // 'L' for Live

/// Protocol version
/// - v1: Initial version
/// - v2: Added isDemolished flag to CarState
/// - v3: Added demolishedBy attacker info when demolished
/// - v4: Added bodyId (u16) to CarState for car model identification
/// - v5: Added sleeping state (ball: u8 after lastTouchTeam, car: bit5 in flags)
/// - v6: Added steer (i8) to CarState for wheel steering animation
/// - v7: Added full boost pads data (id, position, isBig, isAvailable, respawnTimer)
/// - v8: Added playlistId (i16), playlistName (string), countdownTime (i8), and isPaused (u8) to GameInfo
const PROTOCOL_VERSION: u8 = 8;

/// Encode a Vector3 (position, velocity, etc.) as 3x f32 little-endian
fn encode_vector3(buf: &mut BytesMut, v: &Vector3) {
    buf.put_f32_le(v.x);
    buf.put_f32_le(v.y);
    buf.put_f32_le(v.z);
}

/// Encode a Quaternion (rotation) as 4x f32 little-endian
fn encode_quaternion(buf: &mut BytesMut, q: &Quaternion) {
    buf.put_f32_le(q.x);
    buf.put_f32_le(q.y);
    buf.put_f32_le(q.z);
    buf.put_f32_le(q.w);
}

/// Encode a length-prefixed UTF-8 string (u8 length + bytes)
fn encode_string(buf: &mut BytesMut, s: &str) {
    let bytes = s.as_bytes();
    let len = bytes.len().min(255) as u8;
    buf.put_u8(len);
    buf.put_slice(&bytes[..len as usize]);
}

/// Parse a unique_id (e.g., "Steam_76561198012345678") into (platform, platformId)
fn parse_unique_id(unique_id: &str) -> (&str, &str) {
    if let Some(idx) = unique_id.find('_') {
        let (platform, rest) = unique_id.split_at(idx);
        // Skip the underscore
        let platform_id = &rest[1..];
        (platform, platform_id)
    } else {
        // Fallback: unknown platform, use whole string as ID
        ("unknown", unique_id)
    }
}

/// Encode game info (time, scores, flags, last scorer)
fn encode_game_info(buf: &mut BytesMut, info: &GameInfo, cars: &[CarSnapshot]) {
    buf.put_f32_le(info.time_remaining);
    buf.put_u8(info.score_blue.min(255) as u8);
    buf.put_u8(info.score_orange.min(255) as u8);

    // Game flags bitfield: bit0=isOvertime, bit1=isRoundActive (inverse of isMatchEnded)
    let flags = (if info.is_overtime { 1u8 } else { 0 })
        | (if !info.is_match_ended { 2 } else { 0 });
    buf.put_u8(flags);

    // Last scorer info
    if let Some(ref scorer_id) = info.last_scorer_id {
        // Find scorer in cars list
        if let Some(scorer) = cars.iter().find(|c| &c.unique_id == scorer_id) {
            let (platform, platform_id) = parse_unique_id(&scorer.unique_id);
            buf.put_u8(1); // hasLastScorer = true
            encode_string(buf, platform_id);
            encode_string(buf, platform);
            encode_string(buf, &scorer.name);
        } else {
            // Scorer not found in current snapshot (may have left)
            // Encode partial info from unique_id
            let (platform, platform_id) = parse_unique_id(scorer_id);
            buf.put_u8(1); // hasLastScorer = true
            encode_string(buf, platform_id);
            encode_string(buf, platform);
            encode_string(buf, ""); // name unknown
        }
    } else {
        buf.put_u8(0); // hasLastScorer = false
    }

    // v8: Playlist info, countdown, and pause state
    buf.put_i16_le(info.playlist_id as i16);
    encode_string(buf, &info.playlist_name);
    buf.put_i8(info.countdown_time.clamp(-128, 127) as i8);
    buf.put_u8(if info.is_paused { 1 } else { 0 });
}

/// Encode a complete game snapshot to binary format
///
/// Returns a BytesMut buffer ready to be sent via Socket.IO
pub fn encode_snapshot(snapshot: &GameSnapshot) -> BytesMut {
    // Pre-allocate buffer (typical size ~750 bytes for 6-player game)
    let mut buf = BytesMut::with_capacity(1024);

    // Header (2 bytes)
    buf.put_u8(MAGIC_BYTE);
    buf.put_u8(PROTOCOL_VERSION);

    // Timestamp (8 bytes) - f64 little-endian
    buf.put_f64_le(snapshot.timestamp as f64);

    // Ball state (54 bytes)
    encode_vector3(&mut buf, &snapshot.ball.position);
    encode_vector3(&mut buf, &snapshot.ball.velocity);
    encode_quaternion(&mut buf, &snapshot.ball.rotation);
    encode_vector3(&mut buf, &snapshot.ball.angular_velocity);
    buf.put_u8(snapshot.ball.last_touch_team.unwrap_or(255));
    buf.put_u8(if snapshot.ball.sleeping { 1 } else { 0 });

    // Cars array
    buf.put_u8(snapshot.cars.len() as u8);
    for car in &snapshot.cars {
        // Parse unique_id to extract platform and platformId
        let (platform, platform_id) = parse_unique_id(&car.unique_id);

        encode_string(&mut buf, &car.name);
        buf.put_u8(car.team);
        buf.put_u8(if car.is_local { 1 } else { 0 });
        encode_string(&mut buf, platform_id);
        encode_string(&mut buf, platform);
        encode_vector3(&mut buf, &car.position);
        encode_vector3(&mut buf, &car.velocity);
        encode_quaternion(&mut buf, &car.rotation);
        buf.put_u8(car.boost);

        // Car flags bitfield: bit0=isBoosting, bit1=isOnGround, bit2=isSupersonic, bit3=isDemolished, bit4=isBallCam, bit5=isSleeping
        let flags = (if car.is_boosting { 1u8 } else { 0 })
            | (if car.is_on_ground { 2 } else { 0 })
            | (if car.is_supersonic { 4 } else { 0 })
            | (if car.is_demolished { 8 } else { 0 })
            | (if car.ball_cam { 16 } else { 0 })
            | (if car.sleeping { 32 } else { 0 });
        buf.put_u8(flags);

        // Car body ID (u16 is enough for all body IDs)
        buf.put_u16_le(car.body_id.min(65535) as u16);

        // v6: Steer as i8 (-127 to 127, representing -1.0 to 1.0)
        let steer_i8 = (car.steer.clamp(-1.0, 1.0) * 127.0) as i8;
        buf.put_i8(steer_i8);

        // v2: If demolished, encode attacker info
        if car.is_demolished {
            if let Some(attacker_id) = &car.demolished_by {
                // Find attacker in cars list
                if let Some(attacker) = snapshot.cars.iter().find(|c| &c.unique_id == attacker_id) {
                    let (attacker_platform, attacker_platform_id) = parse_unique_id(&attacker.unique_id);
                    buf.put_u8(1); // hasDemolishedBy = true
                    encode_string(&mut buf, attacker_platform_id);
                    encode_string(&mut buf, attacker_platform);
                    encode_string(&mut buf, &attacker.name);
                } else {
                    // Attacker not found in current snapshot (may have left)
                    // Encode partial info from unique_id
                    let (attacker_platform, attacker_platform_id) = parse_unique_id(attacker_id);
                    buf.put_u8(1); // hasDemolishedBy = true
                    encode_string(&mut buf, attacker_platform_id);
                    encode_string(&mut buf, attacker_platform);
                    encode_string(&mut buf, ""); // name unknown
                }
            } else {
                buf.put_u8(0); // hasDemolishedBy = false
            }
        }
    }

    // Boost pads array (v7)
    buf.put_u8(snapshot.boost_pads.len() as u8);
    for pad in &snapshot.boost_pads {
        buf.put_u8(pad.id);
        encode_vector3(&mut buf, &pad.position);
        // Flags: bit0=isBig, bit1=isAvailable
        let flags = (if pad.is_big { 1u8 } else { 0 })
            | (if pad.is_available { 2 } else { 0 });
        buf.put_u8(flags);
        // Respawn timer as u8: timer * 25 (0-250 for 0-10s with 0.04s precision)
        let timer_u8 = (pad.respawn_timer * 25.0).clamp(0.0, 255.0) as u8;
        buf.put_u8(timer_u8);
    }

    // Game info
    if let Some(ref info) = snapshot.game_info {
        encode_game_info(&mut buf, info, &snapshot.cars);
    } else {
        // Default values when game_info not available
        buf.put_f32_le(0.0); // timeRemaining
        buf.put_u8(0);       // scoreBlue
        buf.put_u8(0);       // scoreOrange
        buf.put_u8(0);       // game flags (isOvertime, isRoundActive)
        buf.put_u8(0);       // no last scorer
        // v8: playlist info, countdown, and pause state defaults
        buf.put_i16_le(0);   // playlistId (unknown)
        buf.put_u8(0);       // playlistName (empty string)
        buf.put_i8(0);       // countdownTime
        buf.put_u8(0);       // isPaused
    }

    tracing::debug!(
        size = buf.len(),
        cars = snapshot.cars.len(),
        boost_pads = snapshot.boost_pads.len(),
        "Encoded snapshot"
    );

    buf
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::BallSnapshot;

    fn create_test_snapshot() -> GameSnapshot {
        GameSnapshot {
            timestamp: 1234567890123,
            ball: BallSnapshot {
                position: Vector3 { x: 0.0, y: 0.0, z: 100.0 },
                velocity: Vector3 { x: 1.0, y: 2.0, z: 3.0 },
                rotation: Quaternion { x: 0.0, y: 0.0, z: 0.0, w: 1.0 },
                angular_velocity: Vector3 { x: 0.0, y: 0.0, z: 0.0 },
                last_touch_team: None,
                sleeping: false,
            },
            cars: vec![],
            boost_pads: vec![],
            game_info: None,
        }
    }

    #[test]
    fn test_encode_snapshot_header() {
        let snapshot = create_test_snapshot();
        let buf = encode_snapshot(&snapshot);

        assert_eq!(buf[0], MAGIC_BYTE);
        assert_eq!(buf[1], PROTOCOL_VERSION);
    }

    #[test]
    fn test_encode_snapshot_size() {
        let snapshot = create_test_snapshot();
        let buf = encode_snapshot(&snapshot);

        // Minimum size: header (2) + timestamp (8) + ball (53) + cars count (1) +
        // boost pads count (1) + game info (8)
        assert!(buf.len() >= 73);
    }
}
