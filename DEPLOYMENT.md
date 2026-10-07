# Deployment notes

## Article video uploads

Article videos are stored beneath `UPLOAD_ROOT_DIR/articles/videos/` (production target: `/var/lib/dr-nareman/uploads/articles/videos/`). They are not stored in MongoDB or the release directory.

The application rejects every individual upload larger than exactly `1,073,741,824` bytes (1 GiB), regardless of any proxy setting.

### Node HTTP receive window

The HTTP server explicitly sets `requestTimeout` to `3,600,000` ms (one hour). Node v24 otherwise defaults this total request-receive window to five minutes, which is too short for a legitimate slow 1 GiB upload. `headersTimeout` remains `60,000` ms and `keepAliveTimeout` remains `5,000` ms, preserving the normal defenses for slow headers and idle keep-alive connections. Multer's disk storage removes partially written files when a request aborts.

When video uploads are enabled on the VPS, add a dedicated Nginx exception for only the Admin video-upload route, not a global body-size increase. Adapt the upstream name to the existing deployment configuration:

```nginx
location ~ ^/api/admin/articles/[A-Fa-f0-9]{24}/videos$ {
    client_max_body_size 1050m;
    client_body_timeout 1h;
    proxy_request_buffering off;
    proxy_read_timeout 1h;
    proxy_send_timeout 1h;

    proxy_pass http://dr_nareman_backend;
    # Repeat the existing proxy header configuration for this upstream.
}
```

`1050m` leaves room for multipart overhead while the application remains the authoritative 1 GiB per-video guard. `proxy_request_buffering off` lets the multipart body stream through to the disk-backed application upload; the timeouts accommodate legitimate long uploads without changing unrelated endpoints.

The VPS has approximately 193 GB of disk capacity. This feature deliberately has no small aggregate video quota; production monitoring should account for `UPLOAD_ROOT_DIR` capacity. If large uploads over unreliable connections become common, add a resumable upload protocol as a separate feature.
