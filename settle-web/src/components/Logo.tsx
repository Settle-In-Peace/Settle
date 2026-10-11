interface LogoProps {
  /** 'default' = dark text + blue accent (nav/portal/admin); 'blue' = all-blue (auth pages) */
  variant?: 'default' | 'blue';
  /** 'auto' swaps blue/white mark by theme; 'blue'/'white' pins one mark (for always-light or always-dark surfaces) */
  mark?: 'auto' | 'blue' | 'white';
  markClassName?: string;
  className?: string;
}

export default function Logo({ variant = 'default', mark = 'auto', markClassName = 'h-7 w-auto', className = '' }: LogoProps) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      {mark !== 'white' && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/brand/sp-mark.png" alt="" aria-hidden="true" className={`${markClassName} ${mark === 'auto' ? 'block dark:hidden' : 'block'}`} />
      )}
      {mark !== 'blue' && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/brand/sp-mark-white.png" alt="" aria-hidden="true" className={`${markClassName} ${mark === 'auto' ? 'hidden dark:block' : 'block'}`} />
      )}
      {variant === 'blue' ? (
        <span className="font-bold text-blue-600">Settle<span className="text-blue-400">InPeace</span></span>
      ) : (
        <span className="font-bold text-black dark:text-white">Settle<span className="text-blue-600">InPeace</span></span>
      )}
    </span>
  );
}
