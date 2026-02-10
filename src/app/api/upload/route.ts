import { NextRequest, NextResponse } from 'next/server';
import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';
import { uploadMetadataSchema } from '@/lib/validation/photo-schemas';
import { rateLimiter } from '@/lib/rate-limit';
import { randomBytes } from 'crypto';

// Security constants
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_PIXELS = 25000000; // ~5000x5000 to prevent decompression bombs

// Helper to get client IP
function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  
  if (realIp) {
    return realIp;
  }
  
  return 'unknown';
}

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const ip = getClientIp(request);
    const { success, limit, remaining, reset } = await rateLimiter.limit(`upload_${ip}`);
    
    if (!success) {
      return NextResponse.json(
        { 
          error: 'Rate limit exceeded',
          message: 'Too many upload requests. Please try again later.',
          reset: new Date(reset).toISOString(),
        },
        { 
          status: 429,
          headers: {
            'X-RateLimit-Limit': limit.toString(),
            'X-RateLimit-Remaining': remaining.toString(),
            'X-RateLimit-Reset': reset.toString(),
          },
        }
      );
    }

    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Check file size
    if (file.size === 0) {
      return NextResponse.json(
        { error: 'Empty file not allowed' },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { 
          error: 'File too large',
          message: `File size must not exceed ${MAX_FILE_SIZE / 1024 / 1024}MB`,
        },
        { status: 413 }
      );
    }

    // Read file buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Validate file type by magic bytes (not by extension or MIME)
    const detectedType = await fileTypeFromBuffer(buffer);
    
    if (!detectedType || !ALLOWED_TYPES.includes(detectedType.mime)) {
      return NextResponse.json(
        { 
          error: 'Invalid file type',
          message: 'Only JPEG, PNG, and WebP images are allowed',
          detected: detectedType?.mime || 'unknown',
        },
        { status: 400 }
      );
    }

    // Explicitly reject SVG and other potentially dangerous formats
    if (detectedType.mime.includes('svg') || detectedType.mime.includes('xml')) {
      return NextResponse.json(
        { error: 'SVG files are not allowed for security reasons' },
        { status: 400 }
      );
    }

    // Protect against decompression bombs
    let imageMetadata;
    try {
      imageMetadata = await sharp(buffer).metadata();
      
      if (!imageMetadata.width || !imageMetadata.height) {
        return NextResponse.json(
          { error: 'Invalid image: Could not determine dimensions' },
          { status: 400 }
        );
      }

      const pixels = imageMetadata.width * imageMetadata.height;
      if (pixels > MAX_PIXELS) {
        return NextResponse.json(
          { 
            error: 'Image too large',
            message: `Image dimensions exceed maximum allowed (${Math.sqrt(MAX_PIXELS).toFixed(0)}x${Math.sqrt(MAX_PIXELS).toFixed(0)})`,
          },
          { status: 400 }
        );
      }
    } catch {
      return NextResponse.json(
        { error: 'Invalid image file' },
        { status: 400 }
      );
    }

    // Re-encode with sharp to strip metadata and neutralize polyglot files
    let processedBuffer;
    try {
      processedBuffer = await sharp(buffer)
        .webp({ quality: 90 })
        .withMetadata({}) // Strip all metadata by passing empty object
        .toBuffer();
    } catch {
      return NextResponse.json(
        { error: 'Failed to process image' },
        { status: 500 }
      );
    }

    // Validate optional metadata
    const metadata = {
      title: formData.get('title') as string | null,
      tags: formData.get('tags') as string | null,
    };

    let validatedMetadata;
    try {
      validatedMetadata = uploadMetadataSchema.parse(metadata);
    } catch (err) {
      const error = err as { errors?: unknown; message?: string };
      return NextResponse.json(
        { 
          error: 'Invalid metadata',
          details: error.errors || error.message,
        },
        { status: 400 }
      );
    }

    // Generate secure ID (never use user-supplied filename as storage key)
    const secureId = randomBytes(16).toString('hex');

    // Mock storage response (in production, save to actual storage here)
    const response = {
      success: true,
      id: secureId,
      filename: `${secureId}.webp`,
      size: processedBuffer.length,
      originalSize: file.size,
      dimensions: {
        width: imageMetadata.width,
        height: imageMetadata.height,
      },
      metadata: validatedMetadata,
      // In production, this would be the actual storage URL
      url: `/uploads/${secureId}.webp`,
    };

    return NextResponse.json(response, { 
      status: 200,
      headers: {
        'X-RateLimit-Limit': limit.toString(),
        'X-RateLimit-Remaining': remaining.toString(),
        'X-RateLimit-Reset': reset.toString(),
      },
    });

  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
