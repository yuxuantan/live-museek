'use client';
import React, { useState, useEffect} from 'react';
import withAuth from '../../components/withAuth';
import { useAuth } from '../../context/AuthContext';

const DashboardPage = () => {
  const { user, buskerProfile, updateBuskerProfile } = useAuth();

  const [updateSuccess, setUpdateSuccess] = useState(false);
  const [updateError, setUpdateError] = useState(false);
  const [acceptSwapRequest, setAcceptSwapRequest] = useState(undefined);
  const [selectedContactMethod, setSelectedContactMethod] = useState('');
  const [contactInput, setContactInput] = useState('');

  useEffect(() => {
    if (buskerProfile) {
      setAcceptSwapRequest(buskerProfile?.swap_configs?.accept_swap_requests ?? false);
      setSelectedContactMethod(buskerProfile?.swap_configs?.contact_method ?? '');
      setContactInput(buskerProfile?.swap_configs?.contact_info ?? '');
    }
  }, [buskerProfile]);

  const handleSwapRequestToggle = () => {
    setAcceptSwapRequest(!acceptSwapRequest);
  };

  const handleContactMethodChange = (e) => {
    setSelectedContactMethod(e.target.value);
    setContactInput('');
  };


  const handleContactInputChange = (e) => {
    setContactInput(e.target.value);
  };

  const handleUpdateProfile = async () => {
    try {
      await updateBuskerProfile({
        busker_id: buskerProfile.busker_id,
        name: buskerProfile.name,
        art_form: buskerProfile.art_form,
        act: buskerProfile.act,
        bio: buskerProfile.bio,
        image_url: buskerProfile.image_url,
        socials: buskerProfile.socials,
        user_id: buskerProfile.user_id,
        swap_configs: {
          accept_swap_requests: acceptSwapRequest,
          contact_method: selectedContactMethod,
          contact_info: contactInput
        }
      });
      console.log("Update success");
      setUpdateSuccess(true);
    } catch (error) {
      console.log("Update failed");
      setUpdateError(true);
    }
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
              onChange={handleContactMethodChange}
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
        {/* save button */}
        <button class="primary-btn w-1/3" onClick={handleUpdateProfile}>Save Configs</button>
        {
          updateSuccess &&
          <div class="toast toast-middle toast-end">
            <div class="alert alert-success">
              <span>Configs saved</span>
            </div>
          </div>
        }
        {updateError && <p className="text-red-500">Update failed</p>}

        <div className="card rounded p-6 space-y-4">
          <h1 className="font-bold underline text-2xl">Linked Busker Details</h1>
          <img src={`https://mlbwzkspmgxhudfnsfeb.supabase.co/storage/v1/object/public/busker_images/busker_images/${buskerProfile?.busker_id}.jpg`}></img>
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
