import { Icon } from './Icon';

interface Props {
  onSignUp: () => void;
}

// The close. It used to be a glowing gradient box with a pulsing orb, the
// last template tell on the page; a plain line and one button say the same.
export function FinalCTA({ onSignUp }: Props) {
  return (
    <section className="final-cta">
      <div className="wrap">
        <h2 className="headline">Pick a few stocks. See why they move.</h2>
        <p>Free account, no card. Connect a brokerage later, or never.</p>
        <button type="button" onClick={onSignUp} className="btn btn-primary hero-cta">
          Start for free
          <Icon name="arrowRight" size={16} />
        </button>
      </div>
    </section>
  );
}
