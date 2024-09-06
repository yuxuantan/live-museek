'use client';
import React, { useState } from 'react';
import withAuth from '../../components/withAuth';
import { useAuth } from '../../context/AuthContext';

const DashboardPage = () => {
  const { user, buskerProfile } = useAuth();

  const [acceptSwapRequest, setAcceptSwapRequest] = useState(false);
  const [contactMethods, setContactMethods] = useState([]);
  const [selectedContactMethod, setSelectedContactMethod] = useState('');
  const [contactInput, setContactInput] = useState('');

  const handleSwapRequestToggle = () => {
    setAcceptSwapRequest(!acceptSwapRequest);
  };

  const handleContactMethodChange = (selectedMethod) => {
    setSelectedContactMethod(selectedMethod);
    setContactInput('');
  };

  const handleContactInputChange = (e) => {
    setContactInput(e.target.value);
  };

  return (
    <div className="flex items-center justify-center h-full m-4">
      <div className="grid items-center justify-center content-center gap-4 md:w-3/5 justify-self-center">
        <h1 className="text-3xl">User Profile</h1>
        <p>User Email: {user?.email}</p>
        {/* toggle input - accept swap requests */}
        <label className="inline-flex items-center cursor-pointer gap-4">
          <span className="font-medium dark:text-gray-300">Accept swap requests</span>
          <input
            type="checkbox"
            value=""
            className="sr-only peer"
            checked={acceptSwapRequest}
            onChange={handleSwapRequestToggle}
          />
          <div className="relative w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
        </label>
        {acceptSwapRequest && (
          <div className="mt-4 grid grid-cols-2 gap-4">
            <label className="block mb-2 font-medium">Preferred means of Contact:</label>
            <p></p>
            <select
              className="w-full p-2 border border-gray-300 rounded-md text-black"
              value={selectedContactMethod}
              onChange={(e) => handleContactMethodChange(e.target.value)}
            >
              <option value="">Select Contact Method</option>
              <option value="Telegram">Telegram</option>
              <option value="SMS">SMS</option>
              <option value="Whatsapp">Whatsapp</option>
              <option value="Social media">Social media</option>
            </select>
            {selectedContactMethod && (
              <div className="mt-2">
                <input
                  type="text"
                  className="w-full p-2 border border-gray-300 rounded-md text-black"
                  value={contactInput}
                  onChange={handleContactInputChange}
                  placeholder={`Enter your ${selectedContactMethod} contact details`}
                />
              </div>
            )}
          </div>
        )}
        <div className="card rounded p-6 space-y-4">
          <h1 className="font-bold underline text-2xl">Linked Busker Details</h1>
          <p>ID: {buskerProfile?.busker_id}</p>
          <p>Name: {buskerProfile?.name}</p>
          <p>Art Form: {buskerProfile?.art_form}</p>
          <p>Act: {buskerProfile?.act}</p>
          <p>Bio: {buskerProfile?.bio}</p>
          <p>ImageURL: {buskerProfile?.image_url}</p>
          <p>Socials: {buskerProfile?.socials}</p>
        </div>
      </div>
    </div>
  );
};

DashboardPage.displayName = 'DashboardPage';
export default withAuth(DashboardPage);
