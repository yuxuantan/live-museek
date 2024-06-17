'use client';

import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useRouter } from 'next/navigation';

import { supabase } from '../../supabaseClient';

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login } = useAuth();
  const router = useRouter();

  // get all users from supabase but need to await 
  async function signInWithEmail(inputEmail: string, inputPassword: string) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: inputEmail,
      password: inputPassword,
    })
    return {data, error}
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Implement your authentication logic here
    // Example: const isAuthenticated = await authenticateUser(email, password);
    // const isAuthenticated = email === 'musician@example.com' && password === 'password';

    // get the data from the form
    const {data, error} = await signInWithEmail(email, password)
    console.log(data)
    console.log(error)
    if (data.user) {
      login(email, password);
      router.push('/musicians/dashboard'); // Redirect to the musician's dashboard
    } else {
      alert(error?.message);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="w-full max-w-md p-8 space-y-6 bg-white rounded shadow-md">
        <h2 className="text-2xl font-bold text-center">Musician Login</h2>
        <form className="space-y-6" onSubmit={handleSubmit}>
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
      </div>
    </div>
  );
};

export default Login;
