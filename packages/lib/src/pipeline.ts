/* Order pipeline state — ported verbatim in logic from frontend/js/dashboard/common.js.
 * Pure computation; the rendering lives in @marutham/ui <OrderPipeline>. */

export const PIPELINE_STAGES = [
  'Order Placed',
  'Packaged',
  'VCO Verified',
  'Picked Up',
  'In Transit',
  'At Hub',
  'Out for Delivery',
  'Delivered',
] as const;

const PIPELINE_HUB_ONLY: Record<string, boolean> = { 'In Transit': true, 'At Hub': true };

export type PipelineNodeStatus = 'done' | 'active' | 'pending' | 'skipped';

export interface PipelineNode {
  label: string;
  status: PipelineNodeStatus;
  skipped: boolean;
}

/**
 * Build node states from the order's route + current status.
 * Direct (non-hub) orders show the hub-only stages as skipped/bypassed.
 */
export function buildPipeline(
  route: string | null | undefined,
  currentStatus: string,
): PipelineNode[] {
  const isDirect = route !== 'hub';
  const curIdx = (PIPELINE_STAGES as readonly string[]).indexOf(currentStatus);
  return PIPELINE_STAGES.map((label, i) => {
    const skipped = isDirect && !!PIPELINE_HUB_ONLY[label];
    let status: PipelineNodeStatus;
    if (skipped) status = 'skipped';
    else if (curIdx < 0) status = 'pending';
    else if (i < curIdx) status = 'done';
    else if (i === curIdx) status = 'active';
    else status = 'pending';
    return { label, status, skipped };
  });
}
