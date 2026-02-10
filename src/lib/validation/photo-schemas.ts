import { z } from 'zod';
import { AVAILABLE_TAGS } from '../mock-tag-data';

// Maximum allowed tags per photo
const MAX_TAGS = 10;

// Validate photo title
export const photoTitleSchema = z
  .string()
  .trim()
  .min(1, 'Title is required')
  .max(200, 'Title must be less than 200 characters')
  .refine(
    (val) => !/[\x00-\x1F\x7F]/.test(val),
    'Title contains invalid control characters'
  );

// Validate individual tag
const tagSchema = z
  .string()
  .trim()
  .toLowerCase()
  .refine(
    (val) => AVAILABLE_TAGS.includes(val),
    'Tag must be from the allowed list'
  );

// Validate tags array
export const photoTagsSchema = z
  .array(tagSchema)
  .max(MAX_TAGS, `Maximum ${MAX_TAGS} tags allowed`)
  .transform((tags) => [...new Set(tags)]); // Remove duplicates

// Combined upload metadata schema
export const uploadMetadataSchema = z.object({
  title: photoTitleSchema.optional(),
  tags: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return [];
      return val.split(',').map((t) => t.trim().toLowerCase());
    })
    .pipe(photoTagsSchema),
});

export type UploadMetadata = z.infer<typeof uploadMetadataSchema>;
