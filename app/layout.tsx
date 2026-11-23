import './style.css';
export const metadata = { title: 'ProofQuest · Primus proof experiment', description: 'Independent local zkTLS integration experiment. Rewards disabled.' };
export default function Layout({ children }: Readonly<{children: React.ReactNode}>) {
  return <html lang="en"><body>{children}</body></html>;
}
