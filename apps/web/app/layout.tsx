import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Qorvexa | Enterprise Workflow Automation',
  description: 'A secure control plane for deterministic enterprise workflows, approvals, and bounded AI tasks.'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
