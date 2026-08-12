# V1 Scope

## Product rules

- One authenticated user represents one company.
- Company signature and stamp images are optional private profile assets for future documents that require them; staff accounts are not included.
- UI and generated documents are Bahasa Melayu first.
- Database naming remains English-ready.
- Existing projects and legacy databases will not be migrated.
- MyInvois-ready fields will be planned, but integration begins only after ordinary invoicing is stable.

## Milestones

1. Foundation, authentication, company profile, catalog, site-visit intake and quotation.
2. Projects, variation orders, invoices, payments, receipts and finance. Agreements, deposits and payment schedules are deferred until explicitly agreed.
3. Site operations, photos, defects, handover, warranty, notifications and dashboard completion.

## Agreed main pages

1. Dashboard
2. Profil Syarikat
3. Lawatan Tapak
4. Sebutharga Baru
5. Senarai Sebutharga
6. Projek
7. Kewangan
8. Katalog & Harga

## Lawatan Tapak checkpoint

- Site notes are grouped by user-created `Kawasan kerja` such as Porch, Dapur or Bilik Air 1.
- The main input is free text; measurement text and photos are optional.
- Unsaved customer details and note composers autosave on the device and reopen after an app switch or page reload.
- Draft photos are retained locally until their private upload succeeds; weak connectivity must not discard the note.
- The camera action opens the phone's rear camera directly, with a separate gallery action.
- Prices never appear during a site visit.
- Voice input is not included.
- Twelve common renovation guides appear only when the user requests one.
- Guides are reminders only and never create catalog or quotation items automatically.
- A note can be marked `Perlu Pengesahan`; the flag never blocks quotation preparation.
- Workflow is explicitly `Draf` → `Selesai Site Visit` → `Sediakan Sebutharga`.
- Photos are stored in a private Supabase bucket under the authenticated owner path.

## Sebutharga checkpoint

- A quotation may begin manually or from a completed site visit.
- Customer, phone number, project address and work-area names carry forward from a site visit; site notes remain references until the owner explicitly selects a catalog or manual item.
- New and edited drafts autosave on the device so an app switch or page reload does not discard work.
- Quote numbers default to `SHDDMMYY-XX` with an atomic daily sequence and remain manually editable while the quote is a draft.
- Items are grouped by user-controlled work areas and support catalog selection, manual items, area/length/quantity/lump-sum calculations, manual rates and ordering controls.
- The working copy total is recalculated by Postgres whenever an item changes.
- Workflow is `Draf` → `Dihantar` → `Diterima`; editing a sent quote starts a numbered revision, and an accepted quote is immutable at database level.
- Each sent revision creates an immutable snapshot in the same transaction as its status change.
- The printable A4 quotation is gold/white, supports BM/EN document labels, and can be saved as PDF through the device print flow.
- Item descriptions in the quotation PDF preserve user-entered bullets, new lines, blank paragraphs and long-text wrapping.
- Quotations do not include signature, stamp, customer-acceptance blocks, company email or bank/payment-account details.
- WhatsApp output prepares a customer-facing summary; the detailed PDF is attached by the owner from the phone.

## Projek checkpoint

- A project can only be created from an accepted quotation through the exact action `Teruskan Sebagai Projek`; there is no independent `Projek Baharu` action.
- Conversion is idempotent: one accepted quotation can produce only one project.
- Project numbers use an owner-scoped `PRJ-YYYY-###` sequence.
- Client, address, accepted quotation revision, scope and contract value are copied as an immutable baseline.
- The owner may edit only the operational project name and planned start/end dates.
- Status moves one way through `Persediaan` → `Dijadualkan` → `Aktif` → `Siap Kerja` → `Diserahkan`; system dates are recorded automatically.
- Later scope or value changes belong in Variation Orders and never overwrite the accepted baseline.
- Agreement, deposit and payment-schedule workflows are not included in the current Project module.

## Variation Order checkpoint

- A Variation Order can only be created from an existing Project through `+ Perubahan Kerja`; changes before quotation acceptance remain quotation revisions.
- The accepted quotation scope and original contract amount remain immutable. Approved VO amounts are accumulated separately to derive the current contract amount.
- A VO supports additions, deductions/omissions, replacements, specification changes, discounts and positive or negative time impact.
- Items may reference the locked project baseline, the company catalog or a manual entry. A replacement is recorded as a deduction for the old item plus an addition for the new item so the net effect stays explicit.
- The complete VO draft and the open item composer autosave on the device, including before an app switch, page hide or reload.
- Workflow is `Draf` → `Dihantar` → `Diluluskan` or `Ditolak`. Sent content is locked; a numbered revision must be opened before editing it again.
- Every sent revision creates an immutable server-side snapshot. An approved VO is immutable and immediately updates the project's current contract amount without overwriting its original amount.
- Customer decisions are recorded as WhatsApp, verbal, written or other, with an optional note. Digital signatures from either party are not required.
- The printable A4 VO shows the original contract, signed net variation and proposed/current contract value, but excludes company email, bank/payment-account details and signature blocks.
- WhatsApp output prepares a concise customer-facing summary; the owner attaches the detailed PDF from the phone.
- Approved VOs affect later claimable amounts only. Existing or paid invoices will remain locked when the Finance module is built.

## Kewangan checkpoint

- Invois hanya bermula daripada Projek; draf invois autosave pada peranti dan disimpan secara atomik ke server.
- Invois yang telah dikeluarkan, bayaran dan resit tidak boleh ditulis semula secara senyap. Bayaran separa menghasilkan resit berasingan bagi setiap transaksi.
- Draf dan invois batal tidak termasuk dalam jumlah kewangan atau Penyata Akaun.
- Pusat Kewangan menunjukkan jumlah diinvois, diterima, belum bayar, umur tunggakan, projek dan kutipan terbaru.
- Penyata Akaun projek dibina terus daripada invois serta resit sebenar dan memaparkan baki berjalan, baki belum bayar dan nilai kontrak yang belum dituntut.
- Invois memaparkan maklumat akaun bank syarikat tetapi kekal tanpa e-mel syarikat dan blok tandatangan. Sebutharga, resit dan Penyata Akaun tidak memaparkan maklumat bank.
- Jadual pembayaran kini pilihan pada setiap Projek: template 4, 5, 8 tahap atau manual; nama, pencapaian dan peratus boleh diubah tetapi jumlah mesti tepat 100%.
- Amaun jadual dikira daripada nilai kontrak semasa ketika disimpan. VO tidak mengubah jadual secara senyap; owner mesti menyemak dan menyimpan semula jadual.
- Agreement dan deposit kekal ditangguhkan sehingga dipersetujui secara khusus.
