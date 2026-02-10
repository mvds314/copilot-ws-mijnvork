# Security Implementation Guide

This document describes the security hardening implemented in the Photo Gallery application, aligned with OWASP Top 10 best practices.

## 🛡️ Security Features Implemented

### 1. Secure File Upload (OWASP A03:2021 - Injection)

#### Server-Side Validation (`/api/upload`)

All file uploads are validated server-side with multiple security layers:

**File Type Validation**
- Uses magic byte inspection (not client-provided MIME type or file extension)
- Library: `file-type` for reliable file type detection
- Allowed types: JPEG, PNG, WebP only
- SVG explicitly excluded (XSS risk)

**File Size Limits**
- Maximum: 10MB per file
- Empty files rejected
- Client-side check for UX, server-side for security

**Image Processing**
- All images re-encoded with Sharp to WebP format
- Strips EXIF metadata automatically
- Neutralizes potential polyglot attacks
- Validates pixel dimensions (max 25 megapixels to prevent decompression bombs)

**Example Upload Request:**
```bash
curl -X POST http://localhost:3000/api/upload \
  -F "file=@photo.jpg" \
  -F "title=My Photo" \
  -F "tags=landscape,nature"
```

**Success Response:**
```json
{
  "success": true,
  "file": {
    "name": "photo.jpg",
    "originalSize": 2457600,
    "processedSize": 1234567,
    "detectedType": "image/jpeg",
    "outputType": "image/webp",
    "title": "My Photo",
    "tags": ["landscape", "nature"]
  },
  "message": "File uploaded and processed successfully"
}
```

### 2. Rate Limiting (OWASP A04:2021 - Insecure Design)

**Implementation**
- 10 uploads per minute per IP address
- Supports Upstash Redis (production) or in-memory (development)
- Returns HTTP 429 with clear error message when limit exceeded

**Configuration**

For production with Redis:
```bash
export UPSTASH_REDIS_REST_URL="https://your-redis-url"
export UPSTASH_REDIS_REST_TOKEN="your-token"
```

For development (automatic fallback):
- Uses in-memory rate limiter
- No configuration required
- State is lost on server restart

**Rate Limit Response:**
```json
{
  "error": "Rate limit exceeded. Please try again later.",
  "limit": 10,
  "reset": "2026-02-10T09:48:27.739Z",
  "remaining": 0
}
```

**Headers:**
- `X-RateLimit-Limit`: Maximum requests allowed
- `X-RateLimit-Remaining`: Requests remaining
- `X-RateLimit-Reset`: Timestamp when limit resets

### 3. Input Validation (OWASP A03:2021 - Injection)

**Metadata Validation with Zod**

All user inputs are validated and sanitized:

**Title Validation**
- Required field
- 1-200 characters
- Trimmed whitespace
- Control characters (0x00-0x1F, 0x7F) rejected

**Tag Validation**
- Maximum 10 tags per upload
- Only tags from allowlist accepted (see `src/lib/mock-tag-data.ts`)
- Invalid tags result in HTTP 400 error

**Available Tags:**
```typescript
// Subject tags
'landscape', 'portrait', 'architecture', 'nature', 'wildlife', 'street'

// Event tags
'wedding', 'professional'

// Style tags
'studio', 'macro'

// Location tags
'city', 'building'
```

**Validation Error Example:**
```json
{
  "error": "Invalid metadata",
  "details": [
    {
      "field": "tags",
      "message": "Invalid tags detected. Only allowed tags are permitted."
    }
  ]
}
```

### 4. Security Headers (OWASP A05:2021 - Security Misconfiguration)

All HTTP responses include comprehensive security headers:

**Content Security Policy (CSP)**
```
default-src 'self';
script-src 'self' 'unsafe-inline' 'unsafe-eval';
style-src 'self' 'unsafe-inline';
img-src 'self' blob: data:;
font-src 'self' data:;
connect-src 'self';
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
```

**Additional Headers**
- `X-Frame-Options: DENY` - Prevents clickjacking
- `X-Content-Type-Options: nosniff` - Prevents MIME sniffing
- `Referrer-Policy: strict-origin-when-cross-origin` - Controls referrer info
- `Permissions-Policy` - Restricts sensitive APIs (camera, microphone, etc.)

**Verify Headers:**
```bash
curl -I http://localhost:3000
```

### 5. Access Control (OWASP A01:2021 - Broken Access Control)

**Admin Route Protection**

The admin dashboard is protected by middleware-based access control:

**Enable Admin Access:**
```bash
export NEXT_PUBLIC_ADMIN_ENABLED=true
```

**Behavior:**
- When disabled: `/admin` redirects to home page
- When disabled: Admin link hidden from navigation
- Middleware checks all `/admin/*` routes

**Future Enhancement:**
- Add proper authentication (NextAuth.js, Auth0, etc.)
- Implement role-based access control (RBAC)
- Add session management

### 6. Client-Side Enhancements

**Upload Component (`UploadZone.tsx`)**

Client-side checks are for UX only; all security is server-enforced:

**Features:**
- File type filter (JPEG, PNG, WebP)
- 10MB size limit check before upload
- Real-time upload status (uploading/success/error)
- Memory leak prevention (URL.revokeObjectURL on cleanup)
- Error message display from server

**Usage:**
```tsx
<UploadZone 
  onUpload={(files) => console.log('Uploaded:', files)}
  maxFiles={10}
/>
```

## 🔒 Security Best Practices

### For Development

1. **Never commit secrets** - Use environment variables
2. **Test with invalid inputs** - Try uploading non-images, oversized files, etc.
3. **Monitor rate limits** - Check logs for excessive requests
4. **Review dependencies** - Keep packages updated

### For Production

1. **Use Redis for rate limiting**
   ```bash
   export UPSTASH_REDIS_REST_URL="..."
   export UPSTASH_REDIS_REST_TOKEN="..."
   ```

2. **Configure CSP nonces** (advanced)
   - Replace `unsafe-inline` with nonces
   - See Next.js CSP documentation

3. **Set up authentication**
   - Implement user login
   - Add JWT or session tokens
   - Protect admin routes with real auth

4. **Enable HTTPS only**
   - Use reverse proxy (nginx, Cloudflare)
   - Set `Strict-Transport-Security` header

5. **Monitor and log**
   - Track upload attempts
   - Alert on rate limit violations
   - Log failed authentication

## 🧪 Testing Security

### Test File Upload Security

**Valid upload:**
```bash
curl -X POST http://localhost:3000/api/upload \
  -F "file=@image.jpg" \
  -F "title=Test" \
  -F "tags=landscape"
```

**Invalid file type:**
```bash
echo "fake" > fake.jpg
curl -X POST http://localhost:3000/api/upload \
  -F "file=@fake.jpg" \
  -F "title=Test"
# Should return: "Invalid file type"
```

**Invalid tags:**
```bash
curl -X POST http://localhost:3000/api/upload \
  -F "file=@image.jpg" \
  -F "tags=invalidtag"
# Should return: "Invalid tags detected"
```

### Test Rate Limiting

```bash
# Make 15 rapid requests
for i in {1..15}; do
  curl -X POST http://localhost:3000/api/upload \
    -F "file=@image.jpg" \
    -F "title=Test$i" \
    -w "\nStatus: %{http_code}\n"
done
# First 10 should succeed (200), rest should fail (429)
```

### Test Security Headers

```bash
curl -I http://localhost:3000 | grep -i "x-frame\|x-content\|csp"
```

## 📋 Security Checklist

- [x] File uploads validated server-side (magic bytes)
- [x] File size limits enforced (10MB max)
- [x] Image re-encoding to strip metadata
- [x] Decompression bomb protection (pixel limit)
- [x] Rate limiting implemented (10/minute per IP)
- [x] Input validation with Zod schemas
- [x] Tag allowlist enforcement
- [x] Control character rejection
- [x] Security headers (CSP, X-Frame-Options, etc.)
- [x] Admin route access control
- [x] Memory leak prevention (URL cleanup)
- [x] Error messages don't leak sensitive info
- [x] CodeQL security scan passed

## 🔍 Known Limitations

1. **CSP uses `unsafe-inline`** - For full security, implement nonces
2. **No authentication** - Admin protection is feature flag only
3. **In-memory rate limiter** - Not suitable for multi-instance deployments
4. **Client-side routing** - No API key authentication yet

## 📚 References

- [OWASP Top 10 2021](https://owasp.org/Top10/)
- [Next.js Security](https://nextjs.org/docs/app/building-your-application/configuring/content-security-policy)
- [Sharp Image Processing](https://sharp.pixelplumbing.com/)
- [Zod Validation](https://zod.dev/)
- [Upstash Rate Limiting](https://upstash.com/docs/redis/sdks/ratelimit-ts/overview)
