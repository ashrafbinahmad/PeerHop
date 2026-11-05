//! The mobile/browser web UI, embedded at compile time from `ui/frontend/dist`.

use axum::http::{StatusCode, Uri, header};
use axum::response::{IntoResponse, Response};

#[derive(rust_embed::RustEmbed)]
#[folder = "ui/frontend/dist"]
struct Dist;

pub async fn serve(uri: Uri) -> Response {
    let path = uri.path().trim_start_matches('/');
    if path.starts_with("api/") {
        return StatusCode::NOT_FOUND.into_response();
    }
    if let Some(file) = (!path.is_empty()).then(|| Dist::get(path)).flatten() {
        let mime = mime_guess::from_path(path).first_or_octet_stream();
        // Vite fingerprints everything under assets/, so it can be cached forever.
        let cache = if path.starts_with("assets/") { "public, max-age=31536000, immutable" } else { "no-cache" };
        return ([(header::CONTENT_TYPE, mime.as_ref()), (header::CACHE_CONTROL, cache)], file.data).into_response();
    }
    // SPA: every other route renders index.html.
    match Dist::get("index.html") {
        Some(index) => ([(header::CONTENT_TYPE, "text/html; charset=utf-8"), (header::CACHE_CONTROL, "no-cache")], index.data).into_response(),
        None => (StatusCode::INTERNAL_SERVER_ERROR, "UI not built").into_response(),
    }
}
