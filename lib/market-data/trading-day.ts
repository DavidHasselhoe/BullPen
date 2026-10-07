/**
 * The ET date of the US stock session a day's change describes right now.
 * From 4:00 ET (pre-market) that is today; before then, and over a weekend,
 * it is still the previous weekday's session (holidays aside). `allDay`
 * (crypto) skips the roll-back: it trades around the clock.
 */
export function sessionDateET(now = new Date(), allDay = false): string {
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  if (!allDay) {
    if (et.getHours() < 4) et.setDate(et.getDate() - 1);
    while (et.getDay() === 0 || et.getDay() === 6) et.setDate(et.getDate() - 1);
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${et.getFullYear()}-${pad(et.getMonth() + 1)}-${pad(et.getDate())}`;
}
