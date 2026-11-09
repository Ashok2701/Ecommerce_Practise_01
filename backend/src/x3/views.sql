-- =====================================================================
-- Nexus portal: read-only views over the Sage X3 folder
-- =====================================================================
-- The portal reads Sage X3 ONLY through these NX_* views. It never reads
-- X3 tables directly and never writes to the X3 database: every change is
-- sent through X3 web services (see src/x3/soap-gateway.ts).
--
-- Install (SQL Server, run as a user allowed to create views):
--   npm run x3:views          (uses X3_DB_* and the schemas in .env)
-- Placeholders, replaced by the installer:
--   {{X3}}  X3 folder schema, e.g. SEED.      {{NX}}  view schema, e.g. NEXUS.
-- Grant the portal's read-only login SELECT on the NEXUS schema only.
--
-- If your X3 folder stores something in a different field (for example the
-- brand in another statistical group, or the minimum order quantity in your
-- own user field), change it HERE. The portal code does not change.
-- Fields starting with Z are not standard X3 fields; map each one to your
-- own field or add it (see docs/X3_INTEGRATION.md).
--
-- The same file runs on the simulated X3 folder used by the tests, so keep
-- to SQL that both SQL Server and SQLite accept: no + string concatenation,
-- no ISNULL/IIF/TOP, no date functions.
-- =====================================================================

DROP VIEW IF EXISTS {{NX}}NX_SITE;
-- @@
CREATE VIEW {{NX}}NX_SITE AS
SELECT F.FCY_0 AS code, F.FCYNAM_0 AS name, F.CTY_0 AS city,
       CASE WHEN F.WRHFLG_0 = 2 THEN 'warehouse' ELSE 'branch' END AS kind
FROM {{X3}}FACILITY F
WHERE F.SALFLG_0 = 2 OR F.WRHFLG_0 = 2;
-- @@

-- Items sold in the portal. Brand = statistical group 1, category = item category.
DROP VIEW IF EXISTS {{NX}}NX_PRODUCT;
-- @@
CREATE VIEW {{NX}}NX_PRODUCT AS
SELECT M.ITMREF_0 AS id, M.ITMREF_0 AS sku, M.ITMDES1_0 AS name, M.TSICOD_0 AS brand, M.TCLCOD_0 AS category,
       M.ITMDES2_0 AS pack_size, M.STU_0 AS uom, COALESCE(M.ZMOQ_0, 1) AS moq,
       COALESCE(S.BASPRI_0, 0) AS base_price, COALESCE(V.ZRATE_0, 0) AS tax_rate_pct
FROM {{X3}}ITMMASTER M
LEFT JOIN {{X3}}ITMSALES S ON S.ITMREF_0 = M.ITMREF_0
LEFT JOIN {{X3}}TABVACITM V ON V.VACITM_0 = M.VACITM_0
WHERE M.ITMSTA_0 = 1;
-- @@

-- Stock per item and site. free = physical - allocated (customer consignment
-- locations are not part of PHYSTO; see NX_LOCATION_STOCK).
DROP VIEW IF EXISTS {{NX}}NX_STOCK;
-- @@
CREATE VIEW {{NX}}NX_STOCK AS
SELECT V.ITMREF_0 AS product_id, V.STOFCY_0 AS site, V.PHYSTO_0 AS physical, V.PHYALL_0 AS allocated,
       V.PHYSTO_0 - V.PHYALL_0 AS free_qty, COALESCE(F.OFS_0, 0) AS lead_time_days
FROM {{X3}}ITMMVT V
LEFT JOIN {{X3}}ITMFACILIT F ON F.ITMREF_0 = V.ITMREF_0 AND F.STOFCY_0 = V.STOFCY_0;
-- @@

-- Site price list (price list T30: criteria 1 = item, 3 = site).
DROP VIEW IF EXISTS {{NX}}NX_SITE_PRICE;
-- @@
CREATE VIEW {{NX}}NX_SITE_PRICE AS
SELECT L.PLICRI3_0 AS site, L.PLICRI1_0 AS product_id, L.PRI_0 AS price
FROM {{X3}}SPRICLIST L
WHERE L.PLI_0 = 'T30';
-- @@

DROP VIEW IF EXISTS {{NX}}NX_CUSTOMER;
-- @@
CREATE VIEW {{NX}}NX_CUSTOMER AS
SELECT C.BPCNUM_0 AS id, C.BPCNUM_0 AS code, C.BPCNAM_0 AS name,
       CASE WHEN C.BCGCOD_0 = 'B2C' THEN 'B2C' ELSE 'B2B' END AS type,
       CASE WHEN C.BPCSTA_0 <> 2 THEN 'inactive' WHEN C.OSTCTL_0 = 3 THEN 'on_hold' ELSE 'active' END AS status,
       C.REP_0 AS rep_code, C.TSCCOD_0 AS tier, C.OSTAUZ_0 AS credit_limit, COALESCE(T.DES_0, C.PTE_0) AS payment_terms,
       C.CNTNAM_0 AS contact_name, C.EECNUM_0 AS gstin, C.CREDAT_0 AS since,
       A.BPAADDLIG1_0 AS line1, A.CTY_0 AS city, A.SAT_0 AS state, A.POSCOD_0 AS postal_code, A.CRYNAM_0 AS country, A.TEL1_0 AS phone, A.WEB1_0 AS email,
       B.BPAADDLIG1_0 AS bill_line1, B.CTY_0 AS bill_city, B.SAT_0 AS bill_state, B.POSCOD_0 AS bill_postal_code, B.CRYNAM_0 AS bill_country,
       COALESCE((SELECT SUM(D.AMTCUR_0 - D.PAYCUR_0) FROM {{X3}}GACCDUDATE D WHERE D.BPR_0 = C.BPCNUM_0 AND D.TYP_0 = 'INV'), 0) AS outstanding,
       COALESCE((SELECT MAX(L.DCGVAL1_0) FROM {{X3}}SPRICLIST L WHERE L.PLI_0 = 'T20' AND L.PLICRI4_0 = C.TSCCOD_0), 0) AS tier_discount_pct
FROM {{X3}}BPCUSTOMER C
LEFT JOIN {{X3}}BPADDRESS A ON A.BPANUM_0 = C.BPCNUM_0 AND A.BPAADD_0 = C.BPAADD_0
LEFT JOIN {{X3}}BPADDRESS B ON B.BPANUM_0 = C.BPCNUM_0 AND B.BPAADD_0 = C.BPAINV_0
LEFT JOIN {{X3}}TABPAYTERM T ON T.PTE_0 = C.PTE_0;
-- @@

-- Customer contract prices (price list T10: criteria 1 = item, 2 = customer).
DROP VIEW IF EXISTS {{NX}}NX_CONTRACT_PRICE;
-- @@
CREATE VIEW {{NX}}NX_CONTRACT_PRICE AS
SELECT L.PLICRI2_0 AS customer_id, L.PLICRI1_0 AS product_id, L.PRI_0 AS price, L.PLISTRDAT_0 AS valid_from, L.PLIENDDAT_0 AS valid_to
FROM {{X3}}SPRICLIST L
WHERE L.PLI_0 = 'T10';
-- @@

DROP VIEW IF EXISTS {{NX}}NX_SALES_REP;
-- @@
CREATE VIEW {{NX}}NX_SALES_REP AS
SELECT R.REPNUM_0 AS code, R.REPNAM_0 AS name FROM {{X3}}SALESREP R;
-- @@

-- Offers: price lists flagged for the portal (SPRICCONF.ZPORTAL_0 = 2). One row
-- per price list line; the portal groups the lines into one offer per code.
--   item (criteria 1), customer (2), site (3), customer price tier (4), item category (5)
--   min_qty + discount_pct = quantity break; free_item + free_qty = free goods per min_qty
DROP VIEW IF EXISTS {{NX}}NX_OFFER_LINE;
-- @@
CREATE VIEW {{NX}}NX_OFFER_LINE AS
SELECT C.PLI_0 AS code, C.DES_0 AS title, C.ZTEXT_0 AS description, C.PLIREF_0 AS erp_ref, L.PLICRD_0 AS record,
       L.PLICRI1_0 AS product_id, L.PLICRI2_0 AS customer_id, L.PLICRI3_0 AS site, L.PLICRI4_0 AS tier, L.PLICRI5_0 AS category,
       L.PLISTRDAT_0 AS valid_from, L.PLIENDDAT_0 AS valid_to, L.MINQTY_0 AS min_qty, L.DCGVAL1_0 AS discount_pct,
       L.FOCITMREF_0 AS free_product_id, L.FOCQTY_0 AS free_qty
FROM {{X3}}SPRICCONF C
JOIN {{X3}}SPRICLIST L ON L.PLI_0 = C.PLI_0
WHERE C.ZPORTAL_0 = 2;
-- @@

-- Sales orders. Status mapping (adjust to how your warehouse works):
--   closed without delivery          -> cancelled
--   fully delivered (validated)      -> dispatched   (proof of delivery in the portal then makes it delivered)
--   fully allocated                  -> packed
--   partly allocated                 -> processing
--   otherwise                        -> confirmed
DROP VIEW IF EXISTS {{NX}}NX_ORDER;
-- @@
CREATE VIEW {{NX}}NX_ORDER AS
SELECT H.SOHNUM_0 AS id, H.BPCORD_0 AS customer_id, H.SALFCY_0 AS site, H.ORDDAT_0 AS order_date, H.DEMDLVDAT_0 AS expected_delivery,
       H.CUSORDREF_0 AS po_number, H.REP_0 AS rep_code, H.ORDINVNOT_0 AS net_amount, H.ORDINVATI_0 AS total, H.ZPORTREF_0 AS portal_ref,
       CASE WHEN H.ORDSTA_0 = 2 AND H.DLVSTA_0 = 1 THEN 'cancelled'
            WHEN H.DLVSTA_0 = 3 THEN 'dispatched'
            WHEN H.ALLSTA_0 = 3 THEN 'packed'
            WHEN H.ALLSTA_0 = 2 THEN 'processing'
            ELSE 'confirmed' END AS status
FROM {{X3}}SORDER H;
-- @@

DROP VIEW IF EXISTS {{NX}}NX_ORDER_LINE;
-- @@
CREATE VIEW {{NX}}NX_ORDER_LINE AS
SELECT Q.SOHNUM_0 AS order_id, Q.SOPLIN_0 AS line_no, Q.ITMREF_0 AS product_id, P.ITMDES1_0 AS name, Q.QTY_0 AS quantity, Q.DLVQTY_0 AS delivered_qty,
       P.GROPRI_0 AS gross_price, P.NETPRI_0 AS net_price, P.DISCRGVAL1_0 AS discount_pct,
       CASE WHEN Q.FOCFLG_0 = 2 THEN 1 ELSE 0 END AS free, Q.STOLOC_0 AS location
FROM {{X3}}SORDERQ Q
JOIN {{X3}}SORDERP P ON P.SOHNUM_0 = Q.SOHNUM_0 AND P.SOPLIN_0 = Q.SOPLIN_0;
-- @@

DROP VIEW IF EXISTS {{NX}}NX_DELIVERY;
-- @@
CREATE VIEW {{NX}}NX_DELIVERY AS
SELECT D.SDHNUM_0 AS id, D.SOHNUM_0 AS order_id, D.BPCORD_0 AS customer_id, D.STOFCY_0 AS site, D.DLVDAT_0 AS planned_date, D.SHIDAT_0 AS ship_date,
       CASE WHEN D.CFMFLG_0 = 2 THEN 1 ELSE 0 END AS validated, COALESCE(C.BPTNAM_0, D.BPTNUM_0) AS carrier, D.ZTRKNUM_0 AS tracking_ref
FROM {{X3}}SDELIVERY D
LEFT JOIN {{X3}}BPCARRIER C ON C.BPTNUM_0 = D.BPTNUM_0;
-- @@

DROP VIEW IF EXISTS {{NX}}NX_DELIVERY_LINE;
-- @@
CREATE VIEW {{NX}}NX_DELIVERY_LINE AS
SELECT L.SDHNUM_0 AS delivery_id, L.SDDLIN_0 AS line_no, L.ITMREF_0 AS product_id, L.QTY_0 AS quantity FROM {{X3}}SDELIVERYD L;
-- @@

-- Invoices with what is still open on them (open items, type INV).
DROP VIEW IF EXISTS {{NX}}NX_INVOICE;
-- @@
CREATE VIEW {{NX}}NX_INVOICE AS
SELECT I.NUM_0 AS id, I.BPR_0 AS customer_id, I.FCY_0 AS site, I.ACCDAT_0 AS invoice_date, I.AMTATI_0 AS amount,
       (SELECT MIN(D.SOHNUM_0) FROM {{X3}}SINVOICED D WHERE D.NUM_0 = I.NUM_0) AS order_id,
       (SELECT MIN(U.DUDDAT_0) FROM {{X3}}GACCDUDATE U WHERE U.NUM_0 = I.NUM_0) AS due_date,
       COALESCE((SELECT SUM(U.PAYCUR_0) FROM {{X3}}GACCDUDATE U WHERE U.NUM_0 = I.NUM_0), 0) AS paid
FROM {{X3}}SINVOICE I;
-- @@

-- Customer receipts posted in X3, and the invoices each one paid.
DROP VIEW IF EXISTS {{NX}}NX_RECEIPT;
-- @@
CREATE VIEW {{NX}}NX_RECEIPT AS
SELECT P.NUM_0 AS id, P.BPR_0 AS customer_id, P.ACCDAT_0 AS receipt_date, P.AMTCUR_0 AS amount, P.PAM_0 AS method, P.CHQNUM_0 AS reference, P.ZPORTREF_0 AS portal_ref
FROM {{X3}}PAYMENTH P;
-- @@
DROP VIEW IF EXISTS {{NX}}NX_RECEIPT_LINE;
-- @@
CREATE VIEW {{NX}}NX_RECEIPT_LINE AS
SELECT D.NUM_0 AS receipt_id, D.LIN_0 AS line_no, D.VCRNUM_0 AS invoice_id, D.AMTLIN_0 AS amount FROM {{X3}}PAYMENTD D;
-- @@

DROP VIEW IF EXISTS {{NX}}NX_SUPPLIER;
-- @@
CREATE VIEW {{NX}}NX_SUPPLIER AS
SELECT S.BPSNUM_0 AS id, S.BPSNUM_0 AS code, S.BPSNAM_0 AS name, S.CNTNAM_0 AS contact_name, COALESCE(T.DES_0, S.PTE_0) AS payment_terms,
       A.BPAADDLIG1_0 AS line1, A.CTY_0 AS city, A.SAT_0 AS state, A.POSCOD_0 AS postal_code, A.CRYNAM_0 AS country, A.TEL1_0 AS phone, A.WEB1_0 AS email
FROM {{X3}}BPSUPPLIER S
LEFT JOIN {{X3}}BPADDRESS A ON A.BPANUM_0 = S.BPSNUM_0 AND A.BPAADD_0 = S.BPAADD_0
LEFT JOIN {{X3}}TABPAYTERM T ON T.PTE_0 = S.PTE_0;
-- @@

-- Items a supplier delivers, with the purchase price (purchase price list: criteria 1 = item, 2 = supplier).
DROP VIEW IF EXISTS {{NX}}NX_SUPPLIER_ITEM;
-- @@
CREATE VIEW {{NX}}NX_SUPPLIER_ITEM AS
SELECT B.BPSNUM_0 AS supplier_id, B.ITMREF_0 AS product_id,
       COALESCE((SELECT MAX(P.PRI_0) FROM {{X3}}PPRICLIST P WHERE P.PLICRI1_0 = B.ITMREF_0 AND P.PLICRI2_0 = B.BPSNUM_0), 0) AS unit_cost
FROM {{X3}}ITMBPS B;
-- @@

DROP VIEW IF EXISTS {{NX}}NX_PURCHASE_ORDER;
-- @@
CREATE VIEW {{NX}}NX_PURCHASE_ORDER AS
SELECT P.POHNUM_0 AS id, P.BPSNUM_0 AS supplier_id, P.POHFCY_0 AS site, P.ORDDAT_0 AS order_date, P.EXTRCPDAT_0 AS expected_date,
       CASE WHEN P.CLEFLG_0 = 2 THEN 1 ELSE 0 END AS closed, P.ZPORTREF_0 AS portal_ref
FROM {{X3}}PORDER P;
-- @@
DROP VIEW IF EXISTS {{NX}}NX_PURCHASE_ORDER_LINE;
-- @@
CREATE VIEW {{NX}}NX_PURCHASE_ORDER_LINE AS
SELECT Q.POHNUM_0 AS order_id, Q.POPLIN_0 AS line_no, Q.ITMREF_0 AS product_id, Q.QTYUOM_0 AS quantity, Q.RCPQTYUOM_0 AS received_qty, Q.NETPRI_0 AS unit_cost
FROM {{X3}}PORDERQ Q;
-- @@

-- Goods receipts, one row per receipt line.
DROP VIEW IF EXISTS {{NX}}NX_GOODS_RECEIPT;
-- @@
CREATE VIEW {{NX}}NX_GOODS_RECEIPT AS
SELECT H.PTHNUM_0 AS id, D.POHNUM_0 AS order_id, H.PRHFCY_0 AS site, H.RCPDAT_0 AS receipt_date, H.CREUSR_0 AS created_by,
       D.PTDLIN_0 AS line_no, D.ITMREF_0 AS product_id, D.QTYUOM_0 AS quantity
FROM {{X3}}PRECEIPT H
JOIN {{X3}}PRECEIPTD D ON D.PTHNUM_0 = H.PTHNUM_0;
-- @@

-- Stock at named locations (customer consignment locations).
DROP VIEW IF EXISTS {{NX}}NX_LOCATION_STOCK;
-- @@
CREATE VIEW {{NX}}NX_LOCATION_STOCK AS
SELECT S.STOFCY_0 AS site, S.LOC_0 AS location, S.ITMREF_0 AS product_id, SUM(S.QTYSTU_0) AS quantity
FROM {{X3}}STOCK S
GROUP BY S.STOFCY_0, S.LOC_0, S.ITMREF_0;
-- @@

-- Stock journal. Map your transaction types (STOJOU.TRSTYP_0) to the portal's kinds.
DROP VIEW IF EXISTS {{NX}}NX_STOCK_JOURNAL;
-- @@
CREATE VIEW {{NX}}NX_STOCK_JOURNAL AS
SELECT J.STOFCY_0 AS site, J.ITMREF_0 AS product_id, J.IPTDAT_0 AS moved_at, J.QTYSTU_0 AS quantity, J.VCRNUM_0 AS ref, J.BPRNUM_0 AS party, J.LOC_0 AS location,
       CASE J.TRSTYP_0 WHEN 3 THEN 'receipt' WHEN 4 THEN 'sale' WHEN 20 THEN 'transfer_out' WHEN 21 THEN 'transfer_in'
                       WHEN 30 THEN 'consignment_in' WHEN 31 THEN 'consignment_out' ELSE 'other' END AS kind
FROM {{X3}}STOJOU J;
