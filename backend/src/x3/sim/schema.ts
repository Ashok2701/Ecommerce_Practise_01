import type { Knex } from 'knex';

/**
 * Simulated Sage X3 folder for development and tests.
 *
 * Tables and columns use the X3 names the NX_* views read (x3/views.sql), so
 * the very same view definitions run here (SQLite) and on the client's X3
 * database (SQL Server). Only the columns the portal uses are created.
 *
 * Columns starting with Z are not standard X3 fields: the client's X3
 * consultant adds them as user fields or maps them to the client's own field
 * in views.sql (see docs/X3_INTEGRATION.md).
 */
export async function createSimTables(k: Knex) {
  const t = (name: string, cols: (b: Knex.CreateTableBuilder) => void) => k.schema.createTable(name, cols);
  const s = (b: Knex.CreateTableBuilder, ...names: string[]) => names.forEach((n) => b.string(n, 250));
  const d = (b: Knex.CreateTableBuilder, ...names: string[]) => names.forEach((n) => b.decimal(n, 18, 4).defaultTo(0));
  const i = (b: Knex.CreateTableBuilder, ...names: string[]) => names.forEach((n) => b.integer(n).defaultTo(0));

  // sites
  await t('FACILITY', (b) => { s(b, 'FCY_0', 'FCYNAM_0', 'CTY_0'); i(b, 'WRHFLG_0', 'SALFLG_0'); });
  // items
  await t('ITMMASTER', (b) => { s(b, 'ITMREF_0', 'ITMDES1_0', 'ITMDES2_0', 'TCLCOD_0', 'TSICOD_0', 'STU_0', 'VACITM_0'); i(b, 'ITMSTA_0'); d(b, 'ZMOQ_0'); });
  await t('ITMSALES', (b) => { s(b, 'ITMREF_0'); d(b, 'BASPRI_0'); });
  await t('ITMFACILIT', (b) => { s(b, 'ITMREF_0', 'STOFCY_0'); d(b, 'OFS_0'); });
  await t('TABVACITM', (b) => { s(b, 'VACITM_0'); d(b, 'ZRATE_0'); });
  // stock: totals per site, stock at locations (consignment), stock journal
  await t('ITMMVT', (b) => { s(b, 'ITMREF_0', 'STOFCY_0'); d(b, 'PHYSTO_0', 'PHYALL_0'); });
  await t('STOCK', (b) => { b.increments('STOCKID'); s(b, 'STOFCY_0', 'ITMREF_0', 'LOC_0'); d(b, 'QTYSTU_0'); });
  await t('STOJOU', (b) => { b.increments('ROWID'); s(b, 'STOFCY_0', 'ITMREF_0', 'IPTDAT_0', 'VCRNUM_0', 'BPRNUM_0', 'LOC_0'); i(b, 'TRSTYP_0'); d(b, 'QTYSTU_0'); });
  // customers, addresses, payment terms, sales reps, carriers
  await t('BPCUSTOMER', (b) => { s(b, 'BPCNUM_0', 'BPCNAM_0', 'REP_0', 'TSCCOD_0', 'BCGCOD_0', 'PTE_0', 'CNTNAM_0', 'EECNUM_0', 'CREDAT_0', 'BPAADD_0', 'BPAINV_0'); i(b, 'BPCSTA_0', 'OSTCTL_0'); d(b, 'OSTAUZ_0'); });
  await t('BPADDRESS', (b) => { s(b, 'BPANUM_0', 'BPAADD_0', 'BPAADDLIG1_0', 'CTY_0', 'SAT_0', 'POSCOD_0', 'CRYNAM_0', 'TEL1_0', 'WEB1_0'); });
  await t('TABPAYTERM', (b) => { s(b, 'PTE_0', 'DES_0'); });
  await t('SALESREP', (b) => { s(b, 'REPNUM_0', 'REPNAM_0'); });
  await t('BPCARRIER', (b) => { s(b, 'BPTNUM_0', 'BPTNAM_0'); });
  // price lists (contract prices, tier discounts, offers)
  await t('SPRICCONF', (b) => { s(b, 'PLI_0', 'DES_0', 'ZTEXT_0', 'PLIREF_0'); i(b, 'ZPORTAL_0'); });
  await t('SPRICLIST', (b) => {
    s(b, 'PLICRD_0', 'PLI_0', 'PLICRI1_0', 'PLICRI2_0', 'PLICRI3_0', 'PLICRI4_0', 'PLICRI5_0', 'PLISTRDAT_0', 'PLIENDDAT_0', 'FOCITMREF_0');
    d(b, 'MINQTY_0', 'PRI_0', 'DCGVAL1_0', 'FOCQTY_0');
  });
  // sales orders
  await t('SORDER', (b) => {
    s(b, 'SOHNUM_0', 'BPCORD_0', 'SALFCY_0', 'ORDDAT_0', 'DEMDLVDAT_0', 'CUSORDREF_0', 'REP_0', 'ZPORTREF_0', 'BPAADD_0');
    i(b, 'ORDSTA_0', 'ALLSTA_0', 'DLVSTA_0', 'INVSTA_0'); d(b, 'ORDINVNOT_0', 'ORDINVATI_0');
  });
  await t('SORDERQ', (b) => { s(b, 'SOHNUM_0', 'ITMREF_0', 'STOLOC_0'); i(b, 'SOPLIN_0', 'FOCFLG_0'); d(b, 'QTY_0', 'DLVQTY_0'); });
  await t('SORDERP', (b) => { s(b, 'SOHNUM_0', 'ITMDES1_0'); i(b, 'SOPLIN_0'); d(b, 'GROPRI_0', 'NETPRI_0', 'DISCRGVAL1_0'); });
  // deliveries
  await t('SDELIVERY', (b) => { s(b, 'SDHNUM_0', 'SOHNUM_0', 'BPCORD_0', 'STOFCY_0', 'DLVDAT_0', 'SHIDAT_0', 'BPTNUM_0', 'ZTRKNUM_0'); i(b, 'CFMFLG_0'); });
  await t('SDELIVERYD', (b) => { s(b, 'SDHNUM_0', 'ITMREF_0'); i(b, 'SDDLIN_0'); d(b, 'QTY_0'); });
  // invoices, open items, customer receipts
  await t('SINVOICE', (b) => { s(b, 'NUM_0', 'BPR_0', 'ACCDAT_0', 'FCY_0'); d(b, 'AMTATI_0'); });
  await t('SINVOICED', (b) => { s(b, 'NUM_0', 'SOHNUM_0'); });
  await t('GACCDUDATE', (b) => { s(b, 'NUM_0', 'BPR_0', 'DUDDAT_0', 'TYP_0'); d(b, 'AMTCUR_0', 'PAYCUR_0'); });
  await t('PAYMENTH', (b) => { s(b, 'NUM_0', 'BPR_0', 'ACCDAT_0', 'PAM_0', 'CHQNUM_0', 'ZPORTREF_0', 'FCY_0'); d(b, 'AMTCUR_0'); });
  await t('PAYMENTD', (b) => { s(b, 'NUM_0', 'VCRNUM_0'); i(b, 'LIN_0'); d(b, 'AMTLIN_0'); });
  // suppliers and purchasing
  await t('BPSUPPLIER', (b) => { s(b, 'BPSNUM_0', 'BPSNAM_0', 'PTE_0', 'CNTNAM_0', 'BPAADD_0'); });
  await t('ITMBPS', (b) => { s(b, 'ITMREF_0', 'BPSNUM_0'); });
  await t('PPRICLIST', (b) => { s(b, 'PLICRI1_0', 'PLICRI2_0'); d(b, 'PRI_0'); });
  await t('PORDER', (b) => { s(b, 'POHNUM_0', 'BPSNUM_0', 'POHFCY_0', 'ORDDAT_0', 'EXTRCPDAT_0', 'ZPORTREF_0'); i(b, 'CLEFLG_0'); });
  await t('PORDERQ', (b) => { s(b, 'POHNUM_0', 'ITMREF_0'); i(b, 'POPLIN_0'); d(b, 'QTYUOM_0', 'RCPQTYUOM_0', 'NETPRI_0'); });
  await t('PRECEIPT', (b) => { s(b, 'PTHNUM_0', 'BPSNUM_0', 'PRHFCY_0', 'RCPDAT_0', 'CREUSR_0'); });
  await t('PRECEIPTD', (b) => { s(b, 'PTHNUM_0', 'POHNUM_0', 'ITMREF_0'); i(b, 'PTDLIN_0'); d(b, 'QTYUOM_0'); });
}

export const SIM_TABLES = [
  'FACILITY', 'ITMMASTER', 'ITMSALES', 'ITMFACILIT', 'TABVACITM', 'ITMMVT', 'STOCK', 'STOJOU', 'BPCUSTOMER', 'BPADDRESS', 'TABPAYTERM', 'SALESREP', 'BPCARRIER',
  'SPRICCONF', 'SPRICLIST', 'SORDER', 'SORDERQ', 'SORDERP', 'SDELIVERY', 'SDELIVERYD', 'SINVOICE', 'SINVOICED', 'GACCDUDATE', 'PAYMENTH', 'PAYMENTD',
  'BPSUPPLIER', 'ITMBPS', 'PPRICLIST', 'PORDER', 'PORDERQ', 'PRECEIPT', 'PRECEIPTD',
];

/** X3 stock journal transaction types the portal reads (STOJOU.TRSTYP_0). */
export const TRSTYP = { receipt: 3, sale: 4, transferOut: 20, transferIn: 21, consignmentIn: 30, consignmentOut: 31 } as const;
