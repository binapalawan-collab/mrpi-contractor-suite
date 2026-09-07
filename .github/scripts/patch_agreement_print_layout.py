from pathlib import Path

path = Path('src/pages/AgreementPrintPage.tsx')
text = path.read_text()

replacements = [
    (
        'className="print-document mx-auto overflow-hidden bg-white text-slate-950 shadow-xl"',
        'className="print-document agreement-print-document mx-auto overflow-hidden bg-white text-slate-950 shadow-xl"',
    ),
    (
        '<div className="px-8 py-7">',
        '<div className="agreement-print-body px-8 py-7">',
    ),
    (
        'className="rounded-2xl border border-slate-200 p-4"><h3',
        'className="agreement-scope-card rounded-2xl border border-slate-200 p-4"><h3',
    ),
    (
        'className="quotation-table mt-4 w-full border-collapse text-left text-xs"',
        'className="quotation-table agreement-payment-table mt-4 w-full border-collapse text-left text-xs"',
    ),
    (
        'className="rounded-xl border border-slate-200 p-3 text-xs leading-5"><p className="font-black">{label}</p>',
        'className="agreement-specific-term rounded-xl border border-slate-200 p-3 text-xs leading-5"><p className="font-black">{label}</p>',
    ),
    (
        '<section className="mt-2 grid grid-cols-2 gap-8 border-t border-slate-200 pt-8 text-xs">',
        '<section className="agreement-signature-block mt-2 grid grid-cols-2 gap-8 border-t border-slate-200 pt-8 text-xs">',
    ),
    (
        '<footer className="mt-8 border-t border-slate-200 pt-4 text-[10px] leading-4 text-slate-500">',
        '<footer className="agreement-print-footer mt-8 border-t border-slate-200 pt-4 text-[10px] leading-4 text-slate-500">',
    ),
]

for old, new in replacements:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'Expected exactly one match, got {count}: {old[:90]}')
    text = text.replace(old, new, 1)

path.write_text(text)
