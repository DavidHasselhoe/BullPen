# BullPen Authentication v1

## Overview

BullPen uses **Supabase Auth** as the authentication provider. This document explains the authentication system architecture, user flow, and implementation details.

## Architecture

### Database Schema

**`auth.users`** (Supabase-managed)
- Stores user credentials (password hashes, emails)
- Handled entirely by Supabase Auth
- **We do NOT access this table directly**

**`public.users`** (App-managed)
- Extends `auth.users` with app-specific metadata
- Contains: `id`, `email`, `username`, `full_name`, `avatar_url`, `role`, `created_at`, `updated_at`, `last_login_at`
- `id` references `auth.users.id` (one-to-one relationship)
- **Passwords are NOT stored here**

### Row Level Security (RLS)

The `public.users` table has RLS enabled with the following policies:

1. **Users can read their own profile** - `SELECT` allowed only when `auth.uid() = id`
2. **Users can update their own profile** - `UPDATE` allowed only when `auth.uid() = id`
3. **Trigger can insert users** - `INSERT` allowed via database trigger (signup flow)

### Signup Flow

When a user registers:

1. **Frontend** calls `signUp()` from `lib/auth/auth.ts`
2. **Supabase Auth** creates user in `auth.users` (handles password hashing)
3. **Database trigger** (`on_auth_user_created`) automatically creates row in `public.users`
4. **Frontend** fetches user profile from `public.users` and returns to client

The trigger function `handle_new_user()`:
- Has `SECURITY DEFINER` (bypasses RLS)
- Automatically inserts into `public.users` with `id`, `email`, and `created_at`
- Prevents duplicates with `ON CONFLICT DO NOTHING`

### Login Flow

When a user logs in:

1. **Frontend** calls `signIn()` from `lib/auth/auth.ts`
2. **Supabase Auth** validates credentials against `auth.users`
3. **Supabase Auth** creates JWT session (stored in secure HTTP-only cookie)
4. **Frontend** updates `last_login_at` in `public.users`
5. **Frontend** fetches user profile and returns to client

### Guest Access

- All pages remain accessible when **not logged in**
- Auth state is **optional** - no route protection yet
- Use `useAuth()` hook to detect logged-in state
- Guest users can browse the site without authentication

## Usage

### React Hook: `useAuth()`

```typescript
import { useAuth } from '@/hooks/use-auth';

function MyComponent() {
  const { user, isLoading, isAuthenticated } = useAuth();

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!isAuthenticated) {
    return <div>Please sign in</div>;
  }

  return <div>Welcome, {user?.email}!</div>;
}
```

### Sign Up

```typescript
import { signUp } from '@/lib/auth/auth';

const result = await signUp({
  email: 'user@example.com',
  password: 'secure-password',
});

if (result.success) {
  // User is automatically logged in
  router.push('/');
} else {
  console.error(result.error);
}
```

### Sign In

```typescript
import { signIn } from '@/lib/auth/auth';

const result = await signIn({
  email: 'user@example.com',
  password: 'secure-password',
});

if (result.success) {
  router.push('/');
} else {
  console.error(result.error);
}
```

### Sign Out

```typescript
import { signOut } from '@/lib/auth/auth';

const result = await signOut();
if (result.success) {
  router.push('/');
}
```

### Get Current User

```typescript
import { getCurrentUser } from '@/lib/auth/auth';

const user = await getCurrentUser();
if (user) {
  console.log('Logged in as:', user.email);
} else {
  console.log('Not logged in');
}
```

## Pages

### `/register`

- Card-based layout with email, password, and confirm password fields
- Client-side validation (email format, password length, password match)
- Clear error messages
- Loading state during submission
- Auto-redirects to `/` on success
- Link to `/login` page

### `/login`

- Card-based layout with email and password fields
- Keyboard-friendly (Enter key submits form)
- Loading state during submission
- Supports `?redirect=` query parameter for post-login navigation
- Link to `/register` page

### `AuthModal` (forgot-password mode)

- Entry point is the "Forgot password?" link in the modal's login form (`components/auth/AuthModal.tsx`)
- `AuthFormForgotPassword` sends a reset email via `sendPasswordResetEmail()` (`lib/auth/auth.ts`), without revealing whether the address is registered
- The emailed link lands on `/auth/reset-password`, which exchanges the PKCE code for a recovery session (same mechanism as `/auth/callback`) and lets the user set a new password via `supabase.auth.updateUser({ password })`

## Security

### ✅ Implemented

- **Supabase Auth** handles password hashing (bcrypt/argon2)
- **JWT-based sessions** stored in secure HTTP-only cookies
- **Row Level Security (RLS)** on `public.users` table
- **No plaintext passwords** stored anywhere
- **HTTPS-safe cookies** (JWT tokens)

### ❌ Not Implemented (Future)

- Email verification
- Two-factor authentication (2FA)
- Session management UI
- Role-based permissions

## Type Safety

All types are defined in `lib/types/database.ts`:

```typescript
export interface User {
  id: string; // References auth.users.id
  email: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  role: UserRole; // 'user' | 'admin'
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
}
```

## Database Migration

The migration `009_auth_users.sql` creates:

1. `public.users` table with all required columns
2. Indexes on `email`, `username`, and `role`
3. RLS policies for security
4. Trigger function `handle_new_user()` to auto-create profile on signup
5. Trigger `on_auth_user_created` on `auth.users` insert

To apply:

```bash
supabase db push
```

## Testing

### Manual Testing

1. **Register**: Go to `/register`, create an account, verify redirect
2. **Login**: Go to `/login`, sign in, verify session persists on refresh
3. **Guest Access**: Clear cookies, verify you can still browse the site
4. **Logout**: Sign out, verify session is cleared

### Test Users

Create test users via the Supabase Dashboard or by using the `/register` page.

## Future Enhancements (Auth v2+)

- Email verification before allowing full access
- Role-based access control (admin dashboard, etc.)

## Constraints

- **No custom password hashing** - Supabase Auth handles it
- **No credentials in localStorage** - JWT stored in HTTP-only cookies
- **No route protection yet** - All pages remain public
- **No email verification** - Users can sign up and use the site immediately

## Troubleshooting

### Trigger Not Firing

If `public.users` row is not created on signup:

1. Check Supabase Dashboard → Database → Triggers
2. Verify `on_auth_user_created` trigger exists on `auth.users`
3. Check function `handle_new_user()` has `SECURITY DEFINER`
4. Manually create row if needed (fallback in `signUp()` function)

### RLS Blocking Operations

If you see RLS errors:

1. Check user is authenticated: `auth.uid()` must match `id`
2. Verify policies are correct in migration
3. Service role operations bypass RLS automatically

### Session Not Persisting

- Check Supabase Auth settings (session duration)
- Verify cookies are enabled in browser
- Check `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set

## Files

- **Migration**: `supabase/migrations/009_auth_users.sql`
- **Auth Utilities**: `lib/auth/auth.ts`
- **React Hook**: `hooks/use-auth.ts`
- **Types**: `lib/types/database.ts` (User interface)
- **Register Page**: `app/register/page.tsx`
- **Login Page**: `app/login/page.tsx`
- **UI Components**: `components/ui/input.tsx`, `components/ui/label.tsx`

## References

- [Supabase Auth Documentation](https://supabase.com/docs/guides/auth)
- [Supabase RLS Documentation](https://supabase.com/docs/guides/auth/row-level-security)
- [Next.js App Router Authentication](https://nextjs.org/docs/app/building-your-application/authentication)