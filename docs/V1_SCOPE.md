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
2. Projects, agreements, payment schedules, variation orders, invoices, payments, receipts and finance.
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
- Quotations do not include signature, stamp or customer-acceptance blocks.
- WhatsApp output prepares a customer-facing summary; the detailed PDF is attached by the owner from the phone.
