use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;
use tokio::time::{interval, Duration};

#[cfg(debug_assertions)]
const API_BASE_URL: &str = "http://localhost:3000/api";
#[cfg(not(debug_assertions))]
const API_BASE_URL: &str = "https://api.ballcam.tv/api";

const HEALTH_CHECK_INTERVAL_SECS: u64 = 60;
const HEALTH_CHECK_TIMEOUT_SECS: u64 = 10;

/// Service availability status
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ServiceStatus {
    /// Service is available and responding
    Available,
    /// Currently checking service status
    Checking,
    /// Service is unavailable
    Unavailable { message: String },
}

impl Default for ServiceStatus {
    fn default() -> Self {
        ServiceStatus::Checking
    }
}

/// Health check response from the API
#[derive(Debug, Deserialize)]
pub struct HealthResponse {
    pub status: String,
    #[serde(default)]
    pub message: Option<String>,
}

/// Manages service health checking and status
pub struct HealthChecker {
    status: Mutex<ServiceStatus>,
    is_polling: AtomicBool,
    poll_handle: Mutex<Option<tokio::task::JoinHandle<()>>>,
}

impl HealthChecker {
    pub fn new() -> Self {
        Self {
            status: Mutex::new(ServiceStatus::Checking),
            is_polling: AtomicBool::new(false),
            poll_handle: Mutex::new(None),
        }
    }

    /// Get current service status
    pub async fn get_status(&self) -> ServiceStatus {
        self.status.lock().await.clone()
    }

    /// Check health and update status, returns true if service is available
    pub async fn check_health(&self, app: &AppHandle) -> bool {
        let client = match reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(5))
            .timeout(Duration::from_secs(HEALTH_CHECK_TIMEOUT_SECS))
            .build()
        {
            Ok(c) => c,
            Err(e) => {
                tracing::error!("Failed to build HTTP client: {}", e);
                self.update_status(
                    ServiceStatus::Unavailable {
                        message: "Internal error".to_string(),
                    },
                    app,
                )
                .await;
                return false;
            }
        };

        let result = tokio::time::timeout(
            Duration::from_secs(HEALTH_CHECK_TIMEOUT_SECS),
            client.get(format!("{}/health", API_BASE_URL)).send(),
        )
        .await;

        let new_status = match result {
            Ok(Ok(response)) => {
                if response.status().is_success() {
                    // Try to parse health response
                    match response.json::<HealthResponse>().await {
                        Ok(health) if health.status == "ok" => ServiceStatus::Available,
                        Ok(health) => ServiceStatus::Unavailable {
                            message: health.message.unwrap_or_else(|| "Service degraded".to_string()),
                        },
                        Err(_) => {
                            // Response was 200 but couldn't parse - assume available
                            ServiceStatus::Available
                        }
                    }
                } else if response.status().is_server_error() {
                    ServiceStatus::Unavailable {
                        message: format!("Server error ({})", response.status().as_u16()),
                    }
                } else {
                    // Other status codes (4xx etc) - service is responding
                    ServiceStatus::Available
                }
            }
            Ok(Err(e)) => {
                let message = if e.is_timeout() {
                    "Connection timeout".to_string()
                } else if e.is_connect() {
                    "Cannot connect to server".to_string()
                } else {
                    format!("Network error: {}", e)
                };
                ServiceStatus::Unavailable { message }
            }
            Err(_) => {
                // Outer timeout from tokio::time::timeout
                ServiceStatus::Unavailable {
                    message: "Connection timeout".to_string(),
                }
            }
        };

        let is_available = matches!(new_status, ServiceStatus::Available);
        self.update_status(new_status, app).await;
        is_available
    }

    /// Update status and emit event if changed
    async fn update_status(&self, new_status: ServiceStatus, app: &AppHandle) {
        let mut status = self.status.lock().await;
        if *status != new_status {
            tracing::info!("Service status changed: {:?} -> {:?}", *status, new_status);
            *status = new_status.clone();
            let _ = app.emit("service_status_changed", new_status);
        }
    }

    /// Start polling when service is unavailable
    pub async fn start_polling(&self, app: AppHandle) {
        // Don't start if already polling
        if self.is_polling.swap(true, Ordering::SeqCst) {
            return;
        }

        tracing::info!("Starting health check polling");

        let app_clone = app.clone();
        let is_polling = Arc::new(AtomicBool::new(true));
        let is_polling_clone = is_polling.clone();

        let handle = tokio::spawn(async move {
            let mut interval = interval(Duration::from_secs(HEALTH_CHECK_INTERVAL_SECS));

            while is_polling_clone.load(Ordering::SeqCst) {
                interval.tick().await;

                // Check health directly here
                let client = reqwest::Client::builder()
                    .timeout(Duration::from_secs(HEALTH_CHECK_TIMEOUT_SECS))
                    .build()
                    .unwrap_or_default();

                let result = client
                    .get(format!("{}/health", API_BASE_URL))
                    .send()
                    .await;

                let is_available = match result {
                    Ok(response) if response.status().is_success() => true,
                    _ => false,
                };

                if is_available {
                    tracing::info!("Service is back online, stopping polling");
                    let _ = app_clone.emit("service_status_changed", ServiceStatus::Available);
                    break;
                }
            }
        });

        *self.poll_handle.lock().await = Some(handle);
    }

    /// Stop polling
    pub async fn stop_polling(&self) {
        self.is_polling.store(false, Ordering::SeqCst);
        if let Some(handle) = self.poll_handle.lock().await.take() {
            handle.abort();
        }
        tracing::info!("Stopped health check polling");
    }

    /// Called when an API request fails - checks if we should update status
    pub async fn on_api_error(&self, app: &AppHandle, error: &str) {
        // Check if this looks like a connectivity issue
        let is_connectivity_error = error.contains("timeout")
            || error.contains("connect")
            || error.contains("Network error")
            || error.contains("connection");

        if is_connectivity_error {
            tracing::warn!("API connectivity error detected: {}", error);
            let is_available = self.check_health(app).await;
            if !is_available {
                self.start_polling(app.clone()).await;
            }
        }
    }
}

impl Default for HealthChecker {
    fn default() -> Self {
        Self::new()
    }
}
