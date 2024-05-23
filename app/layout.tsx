import './globals.css';
import Navbar from './components/Navbar';
import { ReactNode } from 'react';
import { AuthProvider } from './contexts/AuthContext';

export const metadata = {
  title: 'Live Music Hub',
  description: 'Discover live music events and musicians',
};

const RootLayout = ({ children }: { children: ReactNode }) => {
  return (
    <html lang="en">
      <body className="bg-gray-100">
        <AuthProvider>
          <Navbar />
          <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
};

export default RootLayout;
