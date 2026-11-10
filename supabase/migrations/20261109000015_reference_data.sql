-- 0015: reference data every environment needs (chart of accounts, reason codes, settings, document counters).
-- Locations, catalog, suppliers and history are seeded by scripts/seed (do not truncate these four tables).

insert into gl_accounts (code, name, type, statement, normal_side) values
  ('1000', 'Cash',                       'asset',          'balance_sheet', 'debit'),
  ('1200', 'Inventory',                  'asset',          'balance_sheet', 'debit'),
  ('1300', 'Work in process',            'asset',          'balance_sheet', 'debit'),
  ('2000', 'Accounts payable',           'liability',      'balance_sheet', 'credit'),
  ('2100', 'Sales tax payable',          'liability',      'balance_sheet', 'credit'),
  ('3000', 'Owner equity',               'equity',         'balance_sheet', 'credit'),
  ('4000', 'Sales',                      'revenue',        'income',        'credit'),
  ('4100', 'Sales returns',              'contra_revenue', 'income',        'debit'),
  ('4200', 'Discounts',                  'contra_revenue', 'income',        'debit'),
  ('5000', 'Cost of goods sold',         'expense',        'income',        'debit'),
  ('5100', 'Waste and spoilage',         'expense',        'income',        'debit'),
  ('5150', 'Quality returns',            'expense',        'income',        'debit'),
  ('5200', 'Production scrap',           'expense',        'income',        'debit'),
  ('5300', 'Inventory adjustments',      'expense',        'income',        'debit'),
  ('6000', 'Labor',                      'expense',        'income',        'debit'),
  ('6100', 'Rent and utilities',         'expense',        'income',        'debit'),
  ('6200', 'Marketing and other',        'expense',        'income',        'debit');

insert into reason_codes (code, category, label) values
  ('COUNT',         'adjustment', 'Cycle count'),
  ('DAMAGE',        'adjustment', 'Damaged'),
  ('EXPIRED',       'waste',      'Expired'),
  ('DROPPED',       'waste',      'Dropped'),
  ('BURNT',         'waste',      'Burnt'),
  ('OVERPROD',      'waste',      'Overproduced'),
  ('UNDERPROOF',    'scrap',      'Underproofed'),
  ('MISSHAPEN',     'scrap',      'Misshapen'),
  ('FILL_LEAK',     'scrap',      'Filling leaked'),
  ('GLAZE_DEFECT',  'scrap',      'Glaze defect'),
  ('QUALITY_STALE', 'return',     'Stale or poor quality'),
  ('FOREIGN_OBJ',   'return',     'Foreign object'),
  ('WRONG_ITEM',    'return',     'Wrong item'),
  ('CHANGED_MIND',  'return',     'Changed mind');

insert into app_settings (id) values (1) on conflict do nothing;

insert into doc_sequences (prefix, next_no) values
  ('ORD', 1), ('RCPT', 1), ('RET', 1), ('PO', 1), ('RCV', 1), ('MO', 1), ('TRF', 1), ('ADJ', 1), ('BAKE', 1)
on conflict do nothing;
