'use client';

import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useRouter } from 'next/navigation';

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { login, loginWithProvider } = useAuth();
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login(email, password);
      window.location.href = '/musician'; // Redirect to profile page on successful login + mount auth again
    } catch (error: any) {
      setError(error.message);
    }
  };

  const handleSocialLogin = async (provider: 'google' | 'facebook') => {
    console.log("Social login with provider", provider);
    try {
      await loginWithProvider(provider);
      // router.push('/profile'); // Redirect to profile page on successful login
    } catch (error: any) {
      setError(error.message);
    }
  };
  

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="card w-full max-w-md p-8 space-y-6 bg-white rounded shadow-md">
        <h2 className="text-2xl font-bold text-center">Musician Login</h2>
        <form className="space-y-6" onSubmit={handleLogin}>
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2 border rounded shadow-sm focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-3 py-2 border rounded shadow-sm focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <button
              type="submit"
              className="w-full px-4 py-2 font-medium text-white bg-blue-600 rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Login
            </button>
          </div>
        </form>
        <div className="flex space-x-2">
          <button
            onClick={() => handleSocialLogin('google')}
            className="flex items-center justify-center w-full px-4 py-2 font-medium text-white bg-gray-600 rounded hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
          >
            <span className="mr-2">Login with Google</span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              className="w-4 h-4"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 12a5 5 0 01-10 0 5 5 0 0110 0z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 6a9 9 0 00-9 9c0 4.97 4.03 9 9 9s9-4.03 9-9a9 9 0 00-9-9zm0 0v4m0 6h4m-4 0a5 5 0 110-10 5 5 0 010 10z"
              />
            </svg>
          </button>
          <button
            onClick={() => handleSocialLogin('facebook')}
            className="flex items-center justify-center w-full px-4 py-2 font-medium text-white bg-gray-600 rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <span className="mr-2">Login with Facebook</span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              className="w-4 h-4"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 2C6.48 2 2 6.48 2 12c0 5.52 4.48 10 10 10s10-4.48 10-10c0-5.52-4.48-10-10-10zm3.5 10h-2v6h-3v-6H8.5V9.5h1.5V8h-1.5c0-1 .8-1.8 1.8-1.8h1v1.5h-1c-.3 0-.5.2-.5.5v1h1.5l-.2 1.5h-1.3V16h3l-.2-6z"
              />
            </svg>
          </button>
        </div>
        {/* insert section for reset password */}
        <div className="flex items-center justify-center space-x-2">
          <button
            onClick={() => router.push('/reset-password')}
            className="text-blue-600 hover:underline focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Forgot your password?
          </button>
        </div>
        {/* insert section for sign up */}
        <div className="flex items-center justify-center space-x-2">
          <span>Don't have an account?</span>
          <button
            onClick={() => router.push('/signup')}
            className="text-blue-600 hover:underline focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Sign Up
          </button>
        </div>
        {error && <p>{error}</p>}
      </div>
    </div>
  );
};

export default Login;
