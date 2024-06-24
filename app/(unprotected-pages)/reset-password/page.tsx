'use client';
import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useRouter } from 'next/navigation';
// implement reset password page
const ResetPassword: React.FC = () => {
    const [email, setEmail] = useState('');
    const [error, setError] = useState<string | null>(null);
    const { resetPassword } = useAuth();
    const router = useRouter();

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await resetPassword(email);
            router.push('192.168.0.224:3000/update-password'); // Redirect to update password page
        } catch (
        error: any
        ) {
            setError(error.message);
        }
    }
    return (
        <div className="flex items-center justify-center min-h-screen">
            <div className="card w-full max-w-md p-8 space-y-6 bg-white rounded shadow-md">
                <h2 className="text-2xl font-bold text-center">Reset Password</h2>
                <form className="space-y-6" onSubmit={handleResetPassword}>
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
                    <button
                        type="submit"
                        className="w-full px-3 py-2 text-white bg-blue-500 rounded shadow-sm hover:bg-blue-600"
                    >
                        Reset Password
                    </button>
                    {error && <p className="text-red-500">{error}</p>}
                </form>
            </div>
        </div>
    );
};

export default ResetPassword;