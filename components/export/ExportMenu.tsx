'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ProBadge } from '@/components/billing/ProBadge';
import { logger } from '@/lib/utils/logger';
import { cn } from '@/lib/utils';

/**
 * The one export control, shared by the screener and holdings.
 *
 * Both surfaces previously carried their own button wired to their own CSV
 * builder, which is how the two builders drifted apart. Anything exportable
 * should mount this and hand it two builders.
 */

export interface ExportMenuProps {
  /** Runs on the CSV item. Sync: the rows are already in memory. */
  onExportCsv: () => void;
  /** Runs on the PDF item. Async because jsPDF is imported on demand. */
  onExportPdf: () => Promise<void>;
  isPro: boolean;
  /** Disabled when there is nothing to export. */
  disabled?: boolean;
  label: string;
  csvLabel: string;
  pdfLabel: string;
  /** Tooltip on the trigger, typically differing for free vs Pro. */
  title?: string;
  className?: string;
}

const TRIGGER_CLASS =
  'flex items-center gap-1 text-xs text-muted-foreground/80 transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50';

export function ExportMenu({
  onExportCsv,
  onExportPdf,
  isPro,
  disabled,
  label,
  csvLabel,
  pdfLabel,
  title,
  className,
}: ExportMenuProps) {
  const router = useRouter();
  const [isBuilding, setIsBuilding] = useState(false);

  const handlePdf = useCallback(async () => {
    // A large PDF takes a moment to lay out and the browser shows nothing until
    // the file lands, so the trigger owns the spinner.
    setIsBuilding(true);
    try {
      await onExportPdf();
    } catch (error) {
      logger.error('PDF export failed', error);
    } finally {
      setIsBuilding(false);
    }
  }, [onExportPdf]);

  // Free users get a button, not a menu: the click is the upsell. Opening a
  // menu of two disabled rows reads as broken rather than as something to buy.
  if (!isPro) {
    return (
      <button
        type="button"
        onClick={() => router.push('/upgrade')}
        title={title}
        className={cn(TRIGGER_CLASS, className)}
      >
        <Download className="h-3 w-3" />
        {label}
        <ProBadge className="ml-0.5" />
      </button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled || isBuilding}
          title={title}
          className={cn(TRIGGER_CLASS, className)}
        >
          {isBuilding ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
          {label}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[9rem]">
        <DropdownMenuItem onSelect={onExportCsv} className="gap-2 text-xs">
          <FileSpreadsheet className="h-3.5 w-3.5" />
          {csvLabel}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={handlePdf} className="gap-2 text-xs">
          <FileText className="h-3.5 w-3.5" />
          {pdfLabel}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
