'use client';

import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useRouter } from 'next/navigation';

const SignUp = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState(null);
  const { signUp, loginWithProvider } = useAuth();
  const router = useRouter();

  const handleSignup = async (e) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    try {
      await signUp(email, password);
    } catch (error) {
      setError(error.message);
    }
  };

  const handleSocialLogin = async (provider) => {
    console.log("Social login with provider", provider);
    try {
      await loginWithProvider(provider);
      // router.push('/profile'); // Redirect to profile page on successful login
    } catch (error) {
      setError(error.message);
    }
  };

  return (
    <div className="flex items-center justify-center mt-16">
      <div className="card w-full max-w-md p-8 space-y-6 rounded shadow-md">
        <h2 className="text-2xl font-bold text-center">Signup now!</h2>
        <form className="space-y-6" onSubmit={handleSignup}>
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
              className="w-full px-3 py-2 border rounded shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-white"
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
              className="w-full px-3 py-2 border rounded shadow-sm bg-white"
            />
          </div>
          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className="w-full px-3 py-2 border rounded shadow-sm bg-white"
            />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <div>
            <button
              type="submit"
              className="secondary-btn w-full px-4 py-2 font-medium text-white rounded focus:outline-none focus:ring-2 focus:ring-offset-2"
            >
              Create an account
            </button>
          </div>
          <div className="flex space-x-2">
            <button
              onClick={() => handleSocialLogin('google')}
              className="secondary-btn-inverse flex items-center justify-center w-full px-4 py-2 font-medium text-white bg-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
            >
              <span className="mr-2">Signup with Google</span>
              <img src="/google.png" className="h-8" />
            </button>
            <button
              onClick={() => handleSocialLogin('facebook')}
              className="secondary-btn-inverse flex items-center justify-center w-full px-4 py-2 font-medium text-white bg-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <span className="mr-2">Signup with Facebook</span>
              <img src="/facebook.png" className="h-8" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

SignUp.displayName = 'SignUp';

export default SignUp;
