'use client';
import { useT } from '@/lib/i18n';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel, cancelLabel, destructive, onConfirm }: { open: boolean; onOpenChange: (v: boolean) => void; title: string; description?: string; confirmLabel?: string; cancelLabel?: string; destructive?: boolean; onConfirm: () => void }) {
  const { t } = useT();
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{cancelLabel ?? t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction data-testid="confirm-action" className={destructive ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''} onClick={onConfirm}>{confirmLabel ?? t('common.submit')}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
