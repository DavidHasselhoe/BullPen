// Avatar Upload Operations
// Handles uploading user avatars to Supabase Storage

import { createBrowserClient } from '../supabase/client';

export interface AvatarUploadResult {
  success: boolean;
  publicUrl?: string;
  path?: string;
  error?: string;
}

const AVATAR_BUCKET = 'user-avatars';

/**
 * Uploads avatar image to Supabase Storage
 * Supports PNG, JPG, and WebP formats
 */
export async function uploadAvatarToStorage(
  userId: string,
  file: File
): Promise<AvatarUploadResult> {
  const supabase = createBrowserClient();

  try {
    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      return {
        success: false,
        error: 'Invalid file type. Please upload a JPEG, PNG, or WebP image.',
      };
    }

    // Validate file size (max 5 MB)
    const maxSize = 5 * 1024 * 1024; // 5 MB
    if (file.size > maxSize) {
      return {
        success: false,
        error: 'File size exceeds 5 MB limit. Please upload a smaller image.',
      };
    }

    // Determine file extension from mime type
    let extension = 'png'; // Default
    if (file.type.includes('jpeg') || file.type.includes('jpg')) {
      extension = 'jpg';
    } else if (file.type.includes('png')) {
      extension = 'png';
    } else if (file.type.includes('webp')) {
      extension = 'webp';
    }

    const fileName = `${userId}.${extension}`;

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from(AVATAR_BUCKET)
      .upload(fileName, file, {
        contentType: file.type,
        upsert: true, // Replace if exists
        cacheControl: 'public, max-age=31536000', // Cache for 1 year
      });

    if (error) {
      // Check for bucket not found error
      if (error.message.includes('Bucket not found') || error.message.includes('does not exist') || error.statusCode === '404' || error.status === '404') {
        return {
          success: false,
          error: `Storage bucket '${AVATAR_BUCKET}' does not exist. Please create it in Supabase Dashboard > Storage.`,
        };
      }

      // Check for permission errors
      if (error.message.includes('new row violates row-level security') || error.message.includes('permission denied') || error.statusCode === '401' || error.statusCode === '403' || error.status === '401' || error.status === '403') {
        return {
          success: false,
          error: `Permission denied. Please check Supabase Storage RLS policies for bucket '${AVATAR_BUCKET}'.`,
        };
      }

      return {
        success: false,
        error: error.message || 'Upload failed',
      };
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(AVATAR_BUCKET)
      .getPublicUrl(fileName);

    if (!urlData?.publicUrl) {
      return {
        success: false,
        error: 'Failed to generate public URL',
      };
    }

    return {
      success: true,
      publicUrl: urlData.publicUrl,
      path: fileName,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
