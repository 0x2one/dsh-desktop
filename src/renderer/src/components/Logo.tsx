/**
 * DeepSeek whale mark, sourced from the harness web favicon
 * (`apps/web/public/favicon.svg`). Host CSS sets `color`; the original
 * prefers-color-scheme fill is stripped so the boot screen (always dark)
 * can force a light mark.
 */
import logoSvg from '../assets/logo.svg?raw'

export interface LogoProps {
  className?: string
}

function Logo({ className }: LogoProps): React.JSX.Element {
  const markup = logoSvg
    .replace(/<style>[\s\S]*?<\/style>\s*/u, '')
    .replace('width="50.000000"', 'width="100%"')
    .replace('height="50.000000"', 'height="100%"')
    .replace('fill="#000"', 'fill="currentColor"')

  return (
    <span className={className} aria-hidden="true" dangerouslySetInnerHTML={{ __html: markup }} />
  )
}

export default Logo
