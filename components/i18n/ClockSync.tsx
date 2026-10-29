'use client';

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/use-auth';
import { intlLocale, resolveHour12, resolveTimeZone, setClock } from '@/lib/dates/clock';

/** Points the display clock at the user's time zone and time format settings and the app language. */
export function ClockSync() {
  const { user } = useAuth();
  const { i18n } = useTranslation();
  const settings = user?.settings as Record<string, unknown> | undefined;
  const pref = settings?.time_zone;
  const formatPref = settings?.time_format;

  useEffect(() => {
    setClock({ timeZone: resolveTimeZone(pref), hour12: resolveHour12(formatPref, i18n.language), locale: intlLocale(i18n.language) });
  }, [pref, formatPref, i18n.language]);

  return null;
}
