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
      <body className="flex flex-col h-screen">
        <AuthProvider>
          <main className="md:mt-16 mb-14 md:mb-0">{children}</main>
          <header className="z-10">
            <Navbar />
          </header>
          {/* <FeedbackForm /> */}

        </AuthProvider>
      </body>
    </html>
  );
};

export default RootLayout;
