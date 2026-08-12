type QuotationFormattedTextProps = {
  text: string
  className?: string
}

export function QuotationFormattedText({ text, className = '' }: QuotationFormattedTextProps) {
  return (
    <p className={`whitespace-pre-wrap break-words [overflow-wrap:anywhere] ${className}`.trim()}>
      {text}
    </p>
  )
}
