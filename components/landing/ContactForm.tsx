'use client';

import { useState, type FormEvent, type CSSProperties } from 'react';
import { Icon } from './Icon';

type Status = 'idle' | 'submitting' | 'success' | 'error';

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: 10,
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  color: 'var(--fg)',
  fontSize: 15,
  fontFamily: 'inherit',
};

export function ContactForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus('submitting');
    setError(null);

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, message }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || 'Something went wrong. Please try again.');
        setStatus('error');
        return;
      }
      setStatus('success');
      setName('');
      setEmail('');
      setMessage('');
    } catch {
      setError('Something went wrong. Please try again.');
      setStatus('error');
    }
  }

  if (status === 'success') {
    return (
      <div
        style={{
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: '32px',
          textAlign: 'center',
          background: 'var(--bg-2)',
        }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 99,
            background: 'var(--accent-soft)',
            color: 'var(--accent)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 16,
          }}
        >
          <Icon name="check" size={22} stroke={2.2} />
        </div>
        <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Message sent</p>
        <p style={{ color: 'var(--fg-muted)', fontSize: 14 }}>Thanks for reaching out — we&apos;ll get back to you soon.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <label htmlFor="contact-name" style={{ display: 'block', fontSize: 13, color: 'var(--fg-muted)', marginBottom: 6 }}>
          Name
        </label>
        <input
          id="contact-name"
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={inputStyle}
        />
      </div>
      <div>
        <label htmlFor="contact-email" style={{ display: 'block', fontSize: 13, color: 'var(--fg-muted)', marginBottom: 6 }}>
          Email
        </label>
        <input
          id="contact-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={inputStyle}
        />
      </div>
      <div>
        <label htmlFor="contact-message" style={{ display: 'block', fontSize: 13, color: 'var(--fg-muted)', marginBottom: 6 }}>
          Message
        </label>
        <textarea
          id="contact-message"
          required
          rows={6}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </div>

      {error && (
        <p role="alert" style={{ color: 'var(--down)', fontSize: 14 }}>
          {error}
        </p>
      )}

      <button type="submit" className="btn btn-primary" disabled={status === 'submitting'} style={{ alignSelf: 'flex-start' }}>
        {status === 'submitting' ? 'Sending…' : 'Send message'}
      </button>
    </form>
  );
}
