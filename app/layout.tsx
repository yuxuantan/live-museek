import './globals.css';
import Navbar from './components/ui/Navbar';
import { ReactNode } from 'react';
import { AuthProvider } from './context/AuthContext';
import { Analytics } from "@vercel/analytics/react"
import Footer from './components/ui/Footer';
export const metadata = {
  title: 'LiveMuseek — Find live music in Singapore',
  description: 'Connect with live music, discover local musicians, and explore upcoming performance schedules in Singapore.',
};

const RootLayout = ({ children }: { children: ReactNode }) => {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col">
        <AuthProvider>
          <header>
            <Navbar />
          </header>
          <main className="flex-1 pb-16 pt-0 md:pb-0 md:pt-20">{children}</main>
          <Footer />
          <Analytics />
        </AuthProvider>
      </body>
    </html>
  );
};

export default RootLayout;
