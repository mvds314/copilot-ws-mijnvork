import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { fileTypeFromBuffer } from 'file-type';
import { z } from 'zod';
import { AVAILABLE_TAGS } from '@/lib/mock-tag-data';

// Constants
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_PIXELS = 25_000_000; // 25 megapixels to prevent decompression bombs
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Validation schemas
const metadataSchema = z.object({
  title: z.string()
    .trim()
    .min(1, 'Title is required')
    .max(200, 'Title too long')
    .refine(
      (val) => !/[\x00-\x1F\x7F]/.test(val),
      'Title contains invalid control characters'
    ),
  tags: z.array(z.string())
    .max(10, 'Too many tags')
    .refine(
      (tags) => tags.every(tag => AVAILABLE_TAGS.includes(tag)),
      'Invalid tags detected. Only allowed tags are permitted.'
    )
    .optional()
    .default([]),
});

// Rate limiting setup
interface RateLimiter {
  limit: (identifier: string) => Promise<{
    success: boolean;
    limit: number;
    reset: number;
    remaining: number;
  }>;
}

let rateLimiter: RateLimiter | null = null;

async function getRateLimiter(): Promise<RateLimiter> {
  if (rateLimiter) return rateLimiter;

  // Try to use Upstash Redis if configured
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    try {
      const { Ratelimit } = await import('@upstash/ratelimit');
      const { Redis } = await import('@upstash/redis');

      const redis = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      });

      rateLimiter = new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(10, '1 m'), // 10 uploads per minute
        analytics: true,
      });
    } catch (error) {
      console.warn('Failed to initialize Upstash rate limiter:', error);
    }
  }

  // Fallback to in-memory rate limiter
  if (!rateLimiter) {
    const { InMemoryRateLimiter } = await import('./in-memory-limiter');
    rateLimiter = new InMemoryRateLimiter(10, 60000); // 10 uploads per minute
  }

  return rateLimiter;
}

function getClientIdentifier(request: NextRequest): string {
  // Try to get IP from various headers
  const forwarded = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const ip = forwarded?.split(',')[0].trim() || realIp || 'unknown';
  
  // Could add user ID here when auth is implemented
  return `upload:${ip}`;
}

async function validateFileType(buffer: Buffer): Promise<{ valid: boolean; mimeType?: string }> {
  try {
    const fileType = await fileTypeFromBuffer(buffer);
    
    if (!fileType) {
      return { valid: false };
    }

    return {
      valid: ALLOWED_MIME_TYPES.includes(fileType.mime),
      mimeType: fileType.mime,
    };
  } catch (error) {
    console.error('File type detection error:', error);
    return { valid: false };
  }
}

async function processImage(buffer: Buffer): Promise<Buffer> {
  try {
    const image = sharp(buffer);
    const metadata = await image.metadata();

    // Check pixel dimensions to prevent decompression bombs
    const pixels = (metadata.width || 0) * (metadata.height || 0);
    if (pixels > MAX_PIXELS) {
      throw new Error(`Image dimensions too large. Maximum ${MAX_PIXELS.toLocaleString()} pixels allowed.`);
    }

    // Re-encode to WebP to strip metadata and neutralize potential polyglots
    // This also ensures the image is safe regardless of original format
    const processedBuffer = await image
      .webp({ quality: 90 })
      .toBuffer();

    return processedBuffer;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Image processing failed: ${error.message}`);
    }
    throw new Error('Image processing failed');
  }
}

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const limiter = await getRateLimiter();
    const identifier = getClientIdentifier(request);
    
    const { success, limit, reset, remaining } = await limiter.limit(identifier);
    
    if (!success) {
      return NextResponse.json(
        { 
          error: 'Rate limit exceeded. Please try again later.',
          limit,
          reset: new Date(reset).toISOString(),
          remaining,
        },
        { 
          status: 429,
          headers: {
            'X-RateLimit-Limit': limit.toString(),
            'X-RateLimit-Remaining': remaining.toString(),
            'X-RateLimit-Reset': reset.toString(),
          }
        }
      );
    }

    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const title = formData.get('title') as string | null;
    const tagsStr = formData.get('tags') as string | null;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size === 0) {
      return NextResponse.json(
        { error: 'Empty file not allowed' },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File size exceeds maximum of ${MAX_FILE_SIZE / 1024 / 1024}MB` },
        { status: 400 }
      );
    }

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Validate file type by magic bytes (not by extension or MIME type from client)
    const { valid, mimeType } = await validateFileType(buffer);
    if (!valid) {
      return NextResponse.json(
        { error: 'Invalid file type. Only JPEG, PNG, and WebP images are allowed.' },
        { status: 400 }
      );
    }

    // Parse and validate metadata
    const tags = tagsStr 
      ? tagsStr.split(',').map(t => t.trim()).filter(Boolean)
      : [];

    let validatedMetadata;
    try {
      validatedMetadata = metadataSchema.parse({
        title: title || file.name,
        tags,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          { 
            error: 'Invalid metadata',
            details: error.issues.map(e => ({ field: e.path.join('.'), message: e.message }))
          },
          { status: 400 }
        );
      }
      throw error;
    }

    // Process image (re-encode to strip metadata and neutralize polyglots)
    const processedBuffer = await processImage(buffer);

    // In a real app, you would save to storage here (S3, local disk, etc.)
    // For now, we'll just return success with metadata
    
    return NextResponse.json({
      success: true,
      file: {
        name: file.name,
        originalSize: file.size,
        processedSize: processedBuffer.length,
        detectedType: mimeType,
        outputType: 'image/webp',
        title: validatedMetadata.title,
        tags: validatedMetadata.tags,
      },
      message: 'File uploaded and processed successfully',
    });

  } catch (error) {
    console.error('Upload error:', error);
    
    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }
    
    return NextResponse.json(
      { error: 'Upload failed. Please try again.' },
      { status: 500 }
    );
  }
}
