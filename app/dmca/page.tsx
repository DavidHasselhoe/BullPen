import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '@/components/landing/Atoms';
import { Footer } from '@/components/landing/Footer';
import { PageMascot } from '@/components/legal/PageMascot';
import { DMCA_FALLBACK_CONTACT_PATH, dmcaAgent } from '@/lib/legal/dmca-agent';
import '@/components/landing/landing-styles.css';

export const metadata: Metadata = {
  title: 'Copyright and DMCA',
  description: 'How to report copyright infringement on BullPen, and how we handle those reports.',
  alternates: { canonical: '/dmca' },
};

export default function DmcaPage() {
  const agent = dmcaAgent();

  return (
    <div className="bullpen-landing-root">
      <div className="content-layer">
        <header style={{ borderBottom: '1px solid var(--border)', padding: '20px 0' }}>
          <div className="wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Link href="/">
              <Logo size="sm" />
            </Link>
            <Link href="/" style={{ fontSize: 14, color: 'var(--fg-muted)' }}>
              ← Back to home
            </Link>
          </div>
        </header>

        <main className="wrap" style={{ padding: '56px 0 96px' }}>
          <div className="legal-doc">
            <PageMascot pose="thinking" className="mb-3" />
            <h1>Copyright and DMCA</h1>
            <p>
              BullPen respects copyright. Parts of the app hold content people write themselves, such as
              profiles, investment theses and comments. If you own a copyright and believe something here
              infringes it, tell us and we will look into it.
            </p>

            <h2>Where to send a notice</h2>
            {agent.registered ? (
              <>
                <p>Copyright notices go to our designated agent:</p>
                <p>
                  {agent.name}
                  <br />
                  {agent.address}
                  <br />
                  Phone: {agent.phone}
                  <br />
                  Email: <a href={`mailto:${agent.email}`}>{agent.email}</a>
                </p>
              </>
            ) : (
              <p>
                Send copyright notices through our <Link href={DMCA_FALLBACK_CONTACT_PATH}>contact form</Link>, with
                &quot;Copyright notice&quot; in the message, and include everything listed below. We read every one of
                them.
              </p>
            )}

            <h2>What a notice needs to include</h2>
            <p>
              So we can act on a report, US copyright law asks for six things. Please include all of them, or we
              may have to come back to you before we can do anything:
            </p>
            <ol>
              <li>Your physical or electronic signature.</li>
              <li>What work you say was infringed, identified clearly enough for us to recognise it.</li>
              <li>What material you say infringes it, and where on BullPen to find it. A link is ideal.</li>
              <li>How we can reach you: address, phone number and email.</li>
              <li>
                A statement that you believe in good faith that the use was not authorised by the copyright owner,
                its agent, or the law.
              </li>
              <li>
                A statement that the information in your notice is accurate and that, under penalty of perjury, you
                are the copyright owner or authorised to act for them.
              </li>
            </ol>

            <h2>What happens next</h2>
            <p>
              When a notice checks out, we remove or disable the material and tell the person who posted it, passing
              on your notice. If we cannot act on a notice, we will say why.
            </p>

            <h2>If you think your content was removed by mistake</h2>
            <p>
              You can send a counter notice. It needs your signature, identification of what was removed and where it
              was, a statement under penalty of perjury that you believe in good faith it was removed by mistake or
              misidentification, your contact details, and your consent to the jurisdiction of a US federal court
              where you live, or where we are if you are outside the United States. If we receive one, we pass it to
              whoever sent the original notice, and we may restore the material after 10 business days unless they
              tell us they have filed a court action.
            </p>

            <h2>Repeat infringers</h2>
            <p>
              Accounts that repeatedly attract valid copyright notices get terminated. We keep a record of notices
              per account so that this is a decision based on history, not on one bad day.
            </p>

            <h2>A word of warning</h2>
            <p>
              Do not send a notice about material you do not own the rights to. Knowingly making a false claim of
              infringement carries liability for damages, including legal costs, under 17 U.S.C. 512(f).
            </p>

            <h2>Questions that are not copyright</h2>
            <p>
              For anything else, including privacy requests and general support, use{' '}
              <Link href="/contact">contact</Link>. Our <Link href="/terms">Terms</Link> and{' '}
              <Link href="/privacy">Privacy Policy</Link> cover the rest of how BullPen works.
            </p>

            {agent.registeredOn && (
              <p style={{ fontSize: 13, color: 'var(--fg-dim)' }}>
                Designated agent on file with the U.S. Copyright Office since {agent.registeredOn}.
              </p>
            )}
          </div>
        </main>

        <Footer />
      </div>
    </div>
  );
}
