import './globals.css';
import Navbar from './components/ui/Navbar';
import { ReactNode } from 'react';
import { AuthProvider } from './context/AuthContext';

export const metadata = {
  title: 'Live Music Hub',
  description: 'Discover live music events and musicians',
};

const RootLayout = ({ children }: { children: ReactNode }) => {
  return (
    <html lang="en">
      <body className="px-4 sm:px-12 lg:px-16 max-w-7xl mx-auto py-6">
        <AuthProvider>
          <Navbar />
          <main className="">{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
};

export default RootLayout;
