'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { Bell, BellRing, Loader2, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useScreenerFilterPresets,
  useCreateScreenerFilterPreset,
  useUpdateScreenerFilterPreset,
  useDeleteScreenerFilterPreset,
  useSavedScreenLimits,
  PresetRequestError,
  type ScreenerFilterPreset,
} from '@/hooks/use-screener-filter-presets';
import type { SavedScreenScope } from '@/lib/screener/saved-screen-limits';
import type { ScreenerFilterValues } from '@/components/screener/ScreenerFilters';

const SCOPE_LABEL_KEYS: Record<SavedScreenScope, string> = {
  sp500: 'screenerSp500Label',
  nasdaq100: 'screenerNasdaq100Label',
  dow30: 'screenerDow30Label',
  all: 'screenerScopeAllStocks',
};

function sameFilters(preset: ScreenerFilterPreset, filters: ScreenerFilterValues): boolean {
  return (Object.keys(filters) as (keyof ScreenerFilterValues)[]).every((k) => (preset.filters[k] ?? '') === filters[k]);
}

/**
 * Saved screens in the filter sidebar: save the current filters under a name,
 * reopen one, and (Pro) ring the bell for a weekday-morning alert when a stock
 * newly matches (api/cron/check-saved-screens). Free accounts keep one screen;
 * the bell and the second save point to Pro. Every failed write shows here.
 */
export function SavedScreens({
  filters,
  saveScope,
  onOpen,
}: {
  filters: ScreenerFilterValues;
  /** The universe the alert will check: the view the screen is saved on. */
  saveScope: SavedScreenScope;
  onOpen: (preset: ScreenerFilterPreset) => void;
}) {
  const { t } = useTranslation('tools');
  const { data: presets = [] } = useScreenerFilterPresets();
  const { canCreate, canAlert } = useSavedScreenLimits();
  const createPreset = useCreateScreenerFilterPreset();
  const updatePreset = useUpdateScreenerFilterPreset();
  const deletePreset = useDeleteScreenerFilterPreset();
  const [naming, setNaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proNote, setProNote] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Delete asks once, inline: the ✕ sits next to the bell, and a misclick would lose the screen and its alert.
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const hasFilters = Object.values(filters).some((v) => v !== '');
  if (presets.length === 0 && !hasFilters) return null;
  const anyAlert = presets.some((p) => p.alert_enabled);

  const save = async () => {
    const name = (inputRef.current?.value ?? '').trim();
    setNaming(false);
    if (!name) return;
    setError(null);
    const active = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== '')) as Partial<ScreenerFilterValues>;
    try {
      await createPreset.mutateAsync({ name, filters: active, scope: saveScope });
    } catch (err) {
      setError(err instanceof PresetRequestError && err.code === 'upgrade_required'
        ? t('screenerSaveScreenLimit')
        : t('screenerSaveScreenError'));
    }
  };

  const toggleAlert = async (preset: ScreenerFilterPreset) => {
    if (!canAlert) { setProNote(true); return; }
    setError(null);
    setBusyId(preset.id);
    try {
      await updatePreset.mutateAsync({ id: preset.id, alert_enabled: !preset.alert_enabled });
    } catch (err) {
      if (err instanceof PresetRequestError && err.code === 'upgrade_required') setProNote(true);
      else setError(t('screenerScreenAlertError'));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (preset: ScreenerFilterPreset) => {
    setConfirmId(null);
    setError(null);
    setBusyId(preset.id);
    try {
      await deletePreset.mutateAsync(preset.id);
    } catch {
      setError(t('screenerDeleteScreenError'));
    } finally {
      setBusyId(null);
    }
  };

  // 40px below lg, where the filters sit in the touch layout; 32px in the desktop sidebar.
  const iconBtn = 'flex h-10 w-10 lg:h-8 lg:w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50';

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold text-foreground">{t('screenerSavedScreensHeading')}</p>

      {presets.length > 0 && (
        <ul className="space-y-0.5">
          {presets.map((preset) => {
            const active = sameFilters(preset, filters);
            const scopeLabel = t(SCOPE_LABEL_KEYS[preset.scope] ?? SCOPE_LABEL_KEYS.sp500);
            const busy = busyId === preset.id;
            return (
              <li key={preset.id} className="flex flex-wrap items-start gap-0.5">
                <button
                  type="button"
                  onClick={() => onOpen(preset)}
                  aria-current={active ? 'true' : undefined}
                  className={cn(
                    'min-h-10 lg:min-h-8 min-w-0 flex-1 break-words rounded-md px-2 py-1.5 text-left text-xs font-medium leading-snug transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    active ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                  )}
                >
                  {preset.name}
                </button>
                <button
                  type="button"
                  onClick={() => toggleAlert(preset)}
                  disabled={busy}
                  aria-pressed={canAlert ? preset.alert_enabled : undefined}
                  aria-label={t('screenerScreenAlertLabel', { name: preset.name, scope: scopeLabel })}
                  title={t('screenerScreenAlertLabel', { name: preset.name, scope: scopeLabel })}
                  className={cn(iconBtn, preset.alert_enabled && 'text-foreground')}
                >
                  {busy && updatePreset.isPending
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : preset.alert_enabled
                      ? <BellRing className="h-3.5 w-3.5 fill-current" />
                      : <Bell className="h-3.5 w-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmId(confirmId === preset.id ? null : preset.id)}
                  disabled={busy}
                  aria-expanded={confirmId === preset.id}
                  aria-label={t('screenerDeleteSavedScreen', { name: preset.name })}
                  title={t('screenerDeleteSavedScreen', { name: preset.name })}
                  className={iconBtn}
                >
                  {busy && deletePreset.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                </button>
                {confirmId === preset.id && (
                  <div
                    className="flex w-full items-center gap-1 pl-2"
                    onKeyDown={(e) => { if (e.key === 'Escape') setConfirmId(null); }}
                  >
                    <span className="mr-auto text-[11px] text-muted-foreground">{t('screenerDeleteSavedScreenConfirm')}</span>
                    <button
                      type="button"
                      autoFocus
                      onClick={() => remove(preset)}
                      className="h-8 rounded-md px-2 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {t('common:delete')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmId(null)}
                      className="h-8 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {t('common:cancel')}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {hasFilters && (naming ? (
        <input
          ref={inputRef}
          autoFocus
          defaultValue=""
          aria-label={t('screenerSaveScreenNameLabel')}
          placeholder={t('screenerSaveScreenNamePlaceholder')}
          maxLength={60}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') { if (inputRef.current) inputRef.current.value = ''; setNaming(false); }
          }}
          className="h-10 lg:h-8 w-full rounded-md border border-primary bg-transparent px-2 text-xs font-medium text-foreground outline-none"
        />
      ) : canCreate ? (
        <button
          type="button"
          onClick={() => { setError(null); setNaming(true); }}
          disabled={createPreset.isPending}
          className="inline-flex h-10 lg:h-8 items-center gap-1 rounded-md border border-dashed border-border px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {createPreset.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          {t('screenerSaveScreen')}
        </button>
      ) : (
        <Link
          href="/upgrade?from=screener_saved_screens"
          className="inline-flex h-10 lg:h-8 items-center gap-1 rounded-md border border-dashed border-border px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Plus className="h-3.5 w-3.5" />
          {t('screenerSaveScreenUpgrade')}
        </Link>
      ))}

      {error && <p role="alert" className="text-[11px] leading-snug text-destructive">{error}</p>}

      {presets.length > 0 && (
        canAlert ? (
          <p className="text-[11px] leading-snug text-muted-foreground">
            {anyAlert ? t('screenerScreenAlertActive') : t('screenerScreenAlertHint')}
          </p>
        ) : (
          <p className={cn('text-[11px] leading-snug', proNote ? 'text-foreground' : 'text-muted-foreground')} aria-live="polite">
            {proNote ? t('screenerScreenAlertPro') : t('screenerSavedScreensFreeNote')}{' '}
            <Link href="/upgrade?from=screener_saved_screens" className="rounded-sm font-medium text-foreground underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {t('screenerSavedScreensSeePro')}
            </Link>
          </p>
        )
      )}
    </div>
  );
}
