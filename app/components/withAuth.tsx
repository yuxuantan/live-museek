import React, { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useRouter } from 'next/navigation';

const withAuth = <P extends object>(Component: React.ComponentType<P>): React.FC<P> => {
  const WrappedComponent: React.FC<P> = (props: P) => {
    const { user, loading } = useAuth();
    const router = useRouter();

    useEffect(() => {
      if (!loading && !user) {
        router.replace('/login'); // Redirect to login page if not authenticated
      }
    }, [user, loading]); // Re-run whenever `user` or `loading` changes

    // While loading, return null (or a spinner/loading component)
    if (loading) {
      return <div>Loading...</div>;
    }

    // If user is still not available, return null to prevent rendering
    if (!user) {
      return null;
    }

    return <Component {...props} />;
  };

  WrappedComponent.displayName = `withAuth(${Component.displayName || Component.name})`;

  return WrappedComponent;
};

export default withAuth;
