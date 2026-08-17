import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { sendEmail } from '@/lib/email/resend';
import { withRateLimit, addSecurityHeaders } from '@/lib/security/api-security';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_MESSAGE_LENGTH = 5000;
const MAX_NAME_LENGTH = 200;

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function handler(req: NextRequest): Promise<NextResponse> {
  const body = await req.json().catch(() => null);

  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const email = typeof body?.email === 'string' ? body.email.trim() : '';
  const message = typeof body?.message === 'string' ? body.message.trim() : '';

  if (!name || name.length > MAX_NAME_LENGTH) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Please enter a valid name.' }, { status: 400 })
    );
  }
  if (!email || !EMAIL_RE.test(email)) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Please enter a valid email address.' }, { status: 400 })
    );
  }
  if (!message || message.length > MAX_MESSAGE_LENGTH) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Please enter a message.' }, { status: 400 })
    );
  }

  const supabase = createServerClient();
  const { error } = await supabase.from('contact_submissions').insert({ name, email, message });

  if (error) {
    console.error('[contact] insert failed:', error.message);
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Something went wrong. Please try again.' }, { status: 500 })
    );
  }

  // Fire-and-forget — a failed notification email must never lose the stored submission.
  // name/email/message are unescaped user input — escape before interpolating into HTML.
  const safeName = escapeHtml(name);
  const safeEmail = escapeHtml(email);
  const safeMessage = escapeHtml(message).replace(/\n/g, '<br>');
  sendEmail({
    to: 'david@hasselo.no',
    subject: `New contact form submission from ${name}`,
    html: `<p><strong>From:</strong> ${safeName} (${safeEmail})</p><p>${safeMessage}</p>`,
  }).catch((err) => {
    console.error('[contact] notification email failed:', err instanceof Error ? err.message : err);
  });

  return addSecurityHeaders(NextResponse.json({ success: true }, { status: 201 }));
}

export const POST = withRateLimit(handler, { windowMs: 60_000, maxRequests: 5, scope: 'contact' });
