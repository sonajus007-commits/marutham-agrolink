import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { TableProps } from '@marutham/ui';

/**
 * The <Table> controls, spoken once.
 *
 * packages/ui has no i18n by design — its components take label props so the
 * other roles keep rendering English and Storybook needs no provider. That would
 * mean eight admin pages each building the same object, so it is built here
 * instead and passed as `labels={useTableLabels()}`.
 *
 * `caption`, `empty` and `searchPlaceholder` are NOT here: they are per-page
 * copy and every page already passes its own.
 */
export function useTableLabels(): NonNullable<TableProps<unknown>['labels']> {
  const { t } = useTranslation();
  return useMemo(
    () => ({
      export: t('admin.table.export', 'Export'),
      selected: (count: number) => t('admin.table.selected', '{{count}} selected', { count }),
      clear: t('admin.table.clear', 'Clear'),
      clearSearch: t('admin.table.clearSearch', 'Clear search'),
      noMatch: (query: string) => t('admin.table.noMatch', 'No rows match “{{query}}”.', { query }),
      selectRow: (name: string) => t('admin.table.selectRow', 'Select {{name}}', { name }),
      selectAll: t('admin.table.selectAll', 'Select all rows on this page'),
      range: (from: number, to: number, total: number) =>
        t('admin.table.range', '{{from}}–{{to}} of {{total}}', { from, to, total }),
      page: (current: number, total: number) =>
        t('admin.table.page', 'Page {{current}} of {{total}}', { current, total }),
      prevPage: t('admin.table.prevPage', 'Previous page'),
      nextPage: t('admin.table.nextPage', 'Next page'),
    }),
    [t],
  );
}
