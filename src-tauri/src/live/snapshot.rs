// Snapshot type conversions from rl-memory to our types

use crate::types::{
    BallSnapshot, BoostPadSnapshot, CarSnapshot, GameInfo,
    GameSnapshot as OurGameSnapshot,
    Quaternion, Vector3,
};

#[cfg(windows)]
use rl_memory::{
    BallState, BoostPadState, CarState,
    GameSnapshot as RlGameSnapshot,
    GameInfo as RlGameInfo,
};

#[cfg(windows)]
impl From<&BallState> for BallSnapshot {
    fn from(ball: &BallState) -> Self {
        BallSnapshot {
            position: Vector3 {
                x: ball.position.x,
                y: ball.position.y,
                z: ball.position.z,
            },
            velocity: Vector3 {
                x: ball.velocity.x,
                y: ball.velocity.y,
                z: ball.velocity.z,
            },
            rotation: Quaternion {
                x: ball.rotation.x,
                y: ball.rotation.y,
                z: ball.rotation.z,
                w: ball.rotation.w,
            },
            angular_velocity: Vector3 {
                x: ball.angular_velocity.x,
                y: ball.angular_velocity.y,
                z: ball.angular_velocity.z,
            },
            last_touch_team: ball.last_touch_team,
            sleeping: ball.sleeping,
            is_hidden: ball.is_hidden,
        }
    }
}

#[cfg(windows)]
impl From<&CarState> for CarSnapshot {
    fn from(car: &CarState) -> Self {
        CarSnapshot {
            name: car.name.clone(),
            team: car.team,
            is_local: car.is_local,
            player_id: car.player_id,
            platform: car.platform.clone(),
            unique_id: car.unique_id.clone(),
            is_bot: car.is_bot,
            position: Vector3 {
                x: car.position.x,
                y: car.position.y,
                z: car.position.z,
            },
            velocity: Vector3 {
                x: car.velocity.x,
                y: car.velocity.y,
                z: car.velocity.z,
            },
            rotation: Quaternion {
                x: car.rotation.x,
                y: car.rotation.y,
                z: car.rotation.z,
                w: car.rotation.w,
            },
            boost: car.boost,
            is_boosting: car.is_boosting,
            is_on_ground: car.is_on_ground,
            is_supersonic: car.is_supersonic,
            ball_cam: car.ball_cam,
            body_id: car.body_id.max(0) as u32,
            is_demolished: car.is_demolished,
            demolished_by: car.demolished_by,
            is_hidden: car.is_hidden,
            sleeping: car.sleeping,
            steer: car.steer,
        }
    }
}

#[cfg(windows)]
impl From<&BoostPadState> for BoostPadSnapshot {
    fn from(pad: &BoostPadState) -> Self {
        BoostPadSnapshot {
            id: pad.id,
            position: Vector3 {
                x: pad.position.x,
                y: pad.position.y,
                z: pad.position.z,
            },
            is_big: pad.is_big,
            is_available: pad.is_available,
            respawn_timer: pad.respawn_timer,
        }
    }
}

#[cfg(windows)]
impl From<&RlGameInfo> for GameInfo {
    fn from(info: &RlGameInfo) -> Self {
        GameInfo {
            event_type: info.event_type.clone(),
            time_remaining: info.time_remaining,
            score_blue: info.score_blue,
            score_orange: info.score_orange,
            is_overtime: info.is_overtime,
            is_match_ended: info.is_match_ended,
            last_scorer_id: info.last_scorer_id,
            playlist_id: info.playlist.id,
            playlist_name: info.playlist.name.clone(),
            countdown_time: info.countdown_time,
            is_paused: info.is_paused,
            is_in_replay: info.is_in_replay,
            time_dilation: info.time_dilation,
            replay_focus_player_id: info.replay_focus_player_id,
            is_on_podium: info.is_on_podium,
        }
    }
}

#[cfg(windows)]
impl From<&RlGameSnapshot> for OurGameSnapshot {
    fn from(game: &RlGameSnapshot) -> Self {
        OurGameSnapshot {
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis() as u64,
            ball: BallSnapshot::from(&game.ball),
            cars: game.cars.iter().map(CarSnapshot::from).collect(),
            boost_pads: game.boost_pads.iter().map(BoostPadSnapshot::from).collect(),
            game_info: None, // Filled separately via get_game_info()
        }
    }
}
