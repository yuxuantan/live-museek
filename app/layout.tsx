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
      <body className="h-screen flex flex-col">
        <AuthProvider>
          <main className="grow">{children}</main>
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
