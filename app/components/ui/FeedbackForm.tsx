'use client';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../supabaseClient';

const FeedbackForm = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [type, setType] = useState('Feedback');
  const formRef = useRef<HTMLDivElement | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // submit form contents as json into supabase feedback table with (id, created_at, feedback)
    const { data, error } = await supabase
      .from('feedback')
      .insert({ feedback: { name, email, message, type } });

    if (error) {
      alert('There is an error submitting feedback. Please report this issue via email to jace@livemuseek.com');
      return;
    }

    alert('Feedback received. Thank you for your input!');
    // reset
    setIsOpen(false);
    setName('');
    setEmail('');
    setMessage('');
    setType('Feedback');
  };

  const handleClickOutside = (event: MouseEvent) => {
    const targetNode = event.target as Node;
    if (formRef.current && !formRef.current.contains(targetNode)) {
      setIsOpen(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('click', handleClickOutside);
    } else {
      document.removeEventListener('click', handleClickOutside);
    }
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div className="fixed bottom-4 right-4">
      {!isOpen && (
        <button
          className="secondary-btn-inverse p-4 rounded-full shadow-lg focus:outline-none"
          onClick={() => setIsOpen(true)}
        >
          Feedback 📝
        </button>
      )}
      {isOpen && (
        <div
          ref={formRef}
          className="relative card border-2 border-purple-600 mt-4 p-4 w-80 max-h-[calc(100vh-2rem)] overflow-y-auto bg-white rounded-lg shadow-lg"
        >
          <button
            className="absolute top-2 right-2 text-gray-500 hover:text-gray-700 focus:outline-none"
            onClick={() => setIsOpen(false)}
          >
            ✖
          </button>
          <h2 className="text-xl font-bold mb-4">Submit Feedback</h2>
          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700">
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border rounded shadow-sm focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border rounded shadow-sm focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700">
                Type
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full px-3 py-2 border rounded shadow-sm focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="Feedback">Feedback</option>
                <option value="Bug Report">Bug Report</option>
                <option value="Feature Suggestion">Feature Suggestion</option>
              </select>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700">
                Message
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full px-3 py-2 border rounded shadow-sm focus:ring-blue-500 focus:border-blue-500"
                rows={4}
                required
              />
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                className="primary-btn text-white px-4 py-2 rounded focus:outline-none"
              >
                Submit
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default FeedbackForm;
