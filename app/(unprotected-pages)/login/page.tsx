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
    <div className="flex items-center justify-center mt-12">
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
              className="secondary-btn w-full px-4 py-2 font-medium text-white rounded focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Login
            </button>
          </div>
        </form>
        <div className="flex space-x-2">
          <button
            onClick={() => handleSocialLogin('google')}
            className="secondary-btn-inverse flex items-center justify-center w-full px-4 py-2 font-medium text-white bg-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
          >
            <span className="mr-2">Login with Google</span>
            <img src="/google.png" className="h-8"/>
            {/* insert google image from web*/}

          </button>
          <button
            onClick={() => handleSocialLogin('facebook')}
            className="secondary-btn-inverse flex items-center justify-center w-full px-4 py-2 font-medium text-white bg-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <span className="mr-2">Login with Facebook</span>
            <img src="/facebook.png" className="h-8"/>
          </button>
        </div>
        {/* insert section for reset password */}
        <div className="flex items-center justify-center space-x-2">
          <button
            onClick={() => router.push('/reset-password')}
            className="hover:underline focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Forgot your password?
          </button>
        </div>
        {/* insert section for sign up */}
        <div className="flex items-center justify-center space-x-2">
          <span>Don't have an account?</span>
          <button
            onClick={() => router.push('/signup')}
            className="text-indigo-500 hover:underline focus:outline-none focus:ring-2 focus:ring-offset-2"
          >
            Sign Up
          </button>
        </div>
        {error && <p>{error}</p>}
      </div>
    </div>
  );
};

Login.displayName = 'Login';
export default Login;
