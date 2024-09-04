import './globals.css';
import Navbar from './components/ui/Navbar';
import { ReactNode } from 'react';
import { AuthProvider } from './context/AuthContext';
import FeedbackForm from './components/ui/FeedbackForm'
export const metadata = {
  title: 'LiveMuseek',
  description: 'Discover live music events and musicians',
};

const RootLayout = ({ children }: { children: ReactNode }) => {
  return (
    <html lang="en">
      <body className="px-4 sm:px-12 lg:px-16 max-w-7xl mx-auto py-6">
        <AuthProvider>
          <Navbar />
          <main className="">{children}</main>
          {/* <FeedbackForm /> */}

        </AuthProvider>
      </body>
    </html>
  );
};

export default RootLayout;
