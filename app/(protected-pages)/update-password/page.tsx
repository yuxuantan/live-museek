'use client';

import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useRouter } from 'next/navigation';
import withAuth from '@/app/components/withAuth';

// create form to update password. just need one password field
const UpdatePassword: React.FC = () => {
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const { updatePassword } = useAuth();
    const router = useRouter();

    const handleUpdatePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await updatePassword(password);
            router.push('/musician'); // Redirect to profile page on successful login
        } catch (
        error: any
        ) {
            setError(error.message);
        }
    }
    return (
        <div className="flex items-center justify-center min-h-screen">
            <div className="card w-full max-w-md p-8 space-y-6 rounded shadow-md">
                <h2 className="text-2xl font-bold text-center">Update Password</h2>
                <form className="space-y-6" onSubmit={handleUpdatePassword}>
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
                    <button
                        type="submit"
                        className="w-full px-3 py-2 text-white bg-blue-500 rounded shadow-sm hover:bg-blue-600"
                    >
                        Update Password
                    </button>
                    {error && <p className="text-red-500">{error}</p>}
                </form>
            </div>
        </div>
    );
};

export default withAuth(UpdatePassword);