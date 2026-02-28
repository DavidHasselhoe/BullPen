// OAuth Profile Extraction
// Extracts and updates user profile data from OAuth providers (Google, etc.)

import { createBrowserClient } from '@/lib/supabase/client';
import type { User as SupabaseUser } from '@supabase/supabase-js';

export interface OAuthProfileData {
  full_name?: string | null;
  avatar_url?: string | null;
  email?: string | null;
}

/**
 * Extracts profile data from Google OAuth user metadata
 * According to Supabase docs, Google provides:
 * - user_metadata.full_name (or name)
 * - user_metadata.avatar_url (or picture)
 * - user_metadata.email
 */
export function extractGoogleProfile(user: SupabaseUser): OAuthProfileData {
  const metadata = user.user_metadata || {};
  
  // Google OAuth provides data in user_metadata
  // Check multiple possible field names for compatibility
  const name = metadata.full_name || metadata.name || 
               (metadata.first_name && metadata.last_name ? `${metadata.first_name} ${metadata.last_name}` : null) ||
               null;
  
  const picture = metadata.avatar_url || metadata.picture || 
                  metadata.avatar || null;
  
  const email = user.email || metadata.email || null;

  return {
    full_name: name,
    avatar_url: picture,
    email: email,
  };
}

/**
 * Downloads an image from a URL and uploads it to Supabase Storage
 * Used for OAuth provider avatars (e.g., Google) to store them in our bucket
 */
async function downloadAndStoreAvatar(
  userId: string,
  imageUrl: string
): Promise<{ success: boolean; publicUrl?: string; error?: string }> {
  const supabase = createBrowserClient();

  try {
    // Download the image
    const response = await fetch(imageUrl);
    if (!response.ok) {
      return {
        success: false,
        error: `Failed to download image: ${response.statusText}`,
      };
    }

    // Get content type from response or default to jpeg
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const blob = await response.blob();

    // Validate file size (max 5 MB)
    const maxSize = 5 * 1024 * 1024; // 5 MB
    if (blob.size > maxSize) {
      return {
        success: false,
        error: 'Image size exceeds 5 MB limit',
      };
    }

    // Determine file extension
    let extension = 'jpg';
    if (contentType.includes('png')) {
      extension = 'png';
    } else if (contentType.includes('webp')) {
      extension = 'webp';
    }

    const fileName = `${userId}.${extension}`;
    const AVATAR_BUCKET = 'user-avatars';

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from(AVATAR_BUCKET)
      .upload(fileName, blob, {
        contentType,
        upsert: true, // Replace if exists
        cacheControl: 'public, max-age=31536000',
      });

    if (uploadError) {
      // If bucket doesn't exist or permission denied, fall back to storing URL
      if (
        uploadError.message.includes('Bucket not found') ||
        uploadError.message.includes('does not exist') ||
        uploadError.message.includes('permission denied')
      ) {
        // Fall back to storing the original URL
        return {
          success: true,
          publicUrl: imageUrl, // Return original URL as fallback
        };
      }
      return {
        success: false,
        error: `Failed to upload to storage: ${uploadError.message}`,
      };
    }

    // Get public URL from our bucket
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
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Updates user profile with OAuth data if missing
 * Only updates fields that are null or empty
 * 
 * @param saveAvatarToBucket - If true, downloads OAuth avatar and saves to our bucket (default: false)
 */
export async function updateUserProfileFromOAuth(
  userId: string,
  profileData: OAuthProfileData,
  saveAvatarToBucket: boolean = false
): Promise<{ success: boolean; error?: string }> {
  const supabase = createBrowserClient();

  try {
    // First, get current user profile to check what's missing
    const { data: currentProfile, error: fetchError } = await supabase
      .from('users')
      .select('full_name, avatar_url')
      .eq('id', userId)
      .single();

    if (fetchError) {
      return {
        success: false,
        error: `Failed to fetch current profile: ${fetchError.message}`,
      };
    }

    // Only update fields that are missing (null or empty)
    const updates: { full_name?: string | null; avatar_url?: string | null } = {};

    if ((!currentProfile?.full_name || currentProfile.full_name.trim() === '') && profileData.full_name) {
      updates.full_name = profileData.full_name;
    }

    if ((!currentProfile?.avatar_url || currentProfile.avatar_url.trim() === '') && profileData.avatar_url) {
      let finalAvatarUrl = profileData.avatar_url;

      // Optionally download and store OAuth avatar in our bucket
      if (saveAvatarToBucket && profileData.avatar_url) {
        const downloadResult = await downloadAndStoreAvatar(userId, profileData.avatar_url);
        if (downloadResult.success && downloadResult.publicUrl) {
          finalAvatarUrl = downloadResult.publicUrl;
        }
        // If download fails, fall back to storing the original URL
        // (error is logged but doesn't block the update)
      }

      updates.avatar_url = finalAvatarUrl;
    }

    // Only update if there are changes to make
    if (Object.keys(updates).length > 0) {
      const { error: updateError } = await supabase
        .from('users')
        .update(updates)
        .eq('id', userId);

      if (updateError) {
        return {
          success: false,
          error: `Failed to update profile: ${updateError.message}`,
        };
      }
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Processes OAuth login and updates profile automatically
 * Should be called after successful OAuth authentication
 * 
 * @param saveAvatarToBucket - If true, downloads OAuth avatar and saves to our bucket (default: false)
 *                             Set to true if you want all avatars stored in your bucket for consistency
 */
export async function processOAuthProfile(
  user: SupabaseUser,
  saveAvatarToBucket: boolean = false
): Promise<{ success: boolean; error?: string }> {
  // Determine provider from user metadata
  const provider = user.app_metadata?.provider || user.user_metadata?.provider || 'unknown';

  let profileData: OAuthProfileData = {};

  if (provider === 'google') {
    profileData = extractGoogleProfile(user);
  } else {
    // For other providers, try generic extraction
    profileData = extractGoogleProfile(user); // Google extraction works for most OAuth providers
  }

  // Update profile if we have data
  if (profileData.full_name || profileData.avatar_url) {
    return await updateUserProfileFromOAuth(user.id, profileData, saveAvatarToBucket);
  }

  return { success: true }; // Nothing to update
}
