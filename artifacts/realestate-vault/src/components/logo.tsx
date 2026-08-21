export function VaultLogo({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 120" className={className}>
      <path d="M50 5 L90 20 L90 70 C90 95 65 112 50 115 C35 112 10 95 10 70 L10 20 Z" fill="url(#goldGrad)" />
      <path d="M50 8 L85 22 L85 68 C85 91 63 106 50 110 C37 106 15 91 15 68 L15 22 Z" fill="#0B2D26" />
      <path d="M25 30 L43 75 L50 90 L57 75 L75 30 L60 30 L50 55 L40 30 Z" fill="url(#goldGrad)" />
      <circle cx="50" cy="40" r="6" fill="#0B2D26" />
      <path d="M47 43 L45 55 L55 55 L53 43 Z" fill="#0B2D26" />
      <defs>
        <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#F3F0E6" />
          <stop offset="30%" stopColor="#C8A95A" />
          <stop offset="100%" stopColor="#8A6E35" />
        </linearGradient>
      </defs>
    </svg>
  );
}