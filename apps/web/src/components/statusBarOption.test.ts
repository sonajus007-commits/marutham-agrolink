import { describe, expect, it } from 'vitest';
import { statusBarOption } from './statusBarOption';

describe('statusBarOption', () => {
  it('lays statuses out on the vertical axis, so long names cannot collide', () => {
    const option = statusBarOption({ Delivered: 2 });
    expect(option.xAxis).toMatchObject({ type: 'value' });
    expect(option.yAxis).toMatchObject({ type: 'category', axisLabel: { interval: 0 } });
  });

  it('ranks shortest first, so the biggest bar draws on top, keeping names with their counts', () => {
    const option = statusBarOption({ 'Order Placed': 46, Cancelled: 14, Delivered: 34 });
    expect(option.yAxis).toMatchObject({ data: ['Cancelled', 'Delivered', 'Order Placed'] });
    expect(option.series).toMatchObject([{ data: [14, 34, 46] }]);
  });

  it('copes with a missing breakdown', () => {
    const option = statusBarOption(undefined, 'Orders');
    expect(option.yAxis).toMatchObject({ data: [] });
    expect(option.series).toMatchObject([{ name: 'Orders', data: [] }]);
  });
});
