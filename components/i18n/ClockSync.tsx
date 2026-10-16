'use client';

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/use-auth';
import { languageUsesHour12, resolveTimeZone, setClock } from '@/lib/dates/clock';

/** Points the display clock at the user's time zone setting and the app language. */
export function ClockSync() {
  const { user } = useAuth();
  const { i18n } = useTranslation();
  const pref = (user?.settings as Record<string, unknown> | undefined)?.time_zone;

  useEffect(() => {
    setClock({ timeZone: resolveTimeZone(pref), hour12: languageUsesHour12(i18n.language) });
  }, [pref, i18n.language]);

  return null;
}
