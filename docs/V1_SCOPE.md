# V1 Scope

## Product rules

- One authenticated user represents one company.
- The owner is the only signer in V1; staff accounts are not included.
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
- Prices never appear during a site visit.
- Voice input is not included.
- Twelve common renovation guides appear only when the user requests one.
- Guides are reminders only and never create catalog or quotation items automatically.
- Photos are stored in a private Supabase bucket under the authenticated owner path.
