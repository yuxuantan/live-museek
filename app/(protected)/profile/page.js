'use client';
import React, { useState, useEffect } from 'react';
import withAuth from '../../components/withAuth';
import { useAuth } from '../../context/AuthContext';

const DashboardPage = () => {
  const { user, buskerProfile, updateBuskerProfile } = useAuth();

  const [updateSuccess, setUpdateSuccess] = useState(false);
  const [updateError, setUpdateError] = useState(false);
  const [acceptSwapRequest, setAcceptSwapRequest] = useState(undefined);
  const [selectedContactMethod, setSelectedContactMethod] = useState('');
  const [contactInput, setContactInput] = useState('');
  const [activeTab, setActiveTab] = useState(0); // To manage active tab
  // custombio
  const [customBio, setCustomBio] = useState('');
  // customimage
  const [customImage, setCustomImage] = useState('');
  const [imagePreview, setImagePreview] = useState(null); // Store the image preview URL


  useEffect(() => {
    if (buskerProfile) {
      setAcceptSwapRequest(buskerProfile?.swap_configs?.accept_swap_requests ?? false);
      setSelectedContactMethod(buskerProfile?.swap_configs?.contact_method ?? '');
      setContactInput(buskerProfile?.swap_configs?.contact_info ?? '');
      setCustomBio(buskerProfile?.custom_profile?.custom_bio ?? '');
      if (buskerProfile?.custom_profile?.custom_image) {
        setImagePreview(URL.createObjectURL(buskerProfile?.custom_profile?.custom_image));
      }
      else {
        setImagePreview(`https://mlbwzkspmgxhudfnsfeb.supabase.co/storage/v1/object/public/busker_images/${buskerProfile?.busker_id}.jpg` ?? null);
      }
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
  const handleBioInputChange = (e) => {
    setCustomBio(e.target.value);
  };

  // Handle file input and show image preview
  const handleProfileImgInputChange = (e) => {
    const file = e.target.files[0];
    if (file && file.type.startsWith('image/')) {
      setCustomImage(file); // Save the file object
      setImagePreview(URL.createObjectURL(file)); // Generate a preview URL for the image
    } else {
      setCustomImage(null);
      setImagePreview(null);
      alert('Please upload a valid image file.');
    }
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
        },
        custom_profile: {
          custom_bio: customBio,
        }
      });
      setUpdateSuccess(true);
    } catch (error) {
      setUpdateError(true);
    }
  };

  return (
    <div className="flex items-center justify-center h-full m-4">
      <div className="items-center justify-center content-center gap-4 md:w-3/5 justify-self-center">
        <h1 className="text-3xl mb-12">User Profile</h1>

        {/* Tabs component */}
        <div className="tabs tabs-lg">
          <a
            className={`tab tab-bordered ${activeTab === 0 ? 'underline underline-offset-8 tab-active text-blue-600' : 'text-gray-400'}`}
            onClick={() => setActiveTab(0)}
          >
            Swap Settings
          </a>
          <a
            className={`tab tab-bordered ${activeTab === 1 ? 'underline underline-offset-8 tab-active text-blue-600' : 'text-gray-400'}`}
            onClick={() => setActiveTab(1)}
          >
            Linked Busker Profile
          </a>
          {/* custom profile (premium only) */}
          <a
            className={`tab tab-bordered ${activeTab === 2 ? 'underline underline-offset-8 tab-active text-blue-600' : 'text-gray-400'}`}
            onClick={() => setActiveTab(2)}
          >
            Custom Profile [Premium only]
          </a>
        </div>

        {/* Tab content */}
        <div className="mt-4">
          {activeTab === 0 && (
            <div className="content p-4 card">
              {/* Settings tab content */}
              <label className="inline-flex items-center cursor-pointer gap-4">
                <span className="font-bold dark:text-gray-300">Accept swap requests</span>
                <input
                  type="checkbox"
                  className="toggle toggle-primary"
                  checked={acceptSwapRequest}
                  onChange={handleSwapRequestToggle}
                />
              </label>

              {acceptSwapRequest && (
                <div className="mt-4 grid grid-cols-2 gap-4">
                  <label className="block mb-2 font-bold">Preferred contact method</label>
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

              <button className="primary-btn w-1/3 mt-4" onClick={handleUpdateProfile}>Save Configs</button>
              {updateSuccess && <div className="toast toast-middle toast-end"><div className="alert alert-success"><span>Configs saved</span></div></div>}
              {updateError && <p className="text-red-500">Update failed</p>}
            </div>
          )}

          {activeTab === 1 && (
            <div className="content p-4">
              {/* Linked Busker Profile tab content */}
              <div className="card rounded p-6 space-y-4">
                <img className="w-2/5" src={`https://mlbwzkspmgxhudfnsfeb.supabase.co/storage/v1/object/public/busker_images/busker_images/${buskerProfile?.busker_id}.jpg`} alt="Busker" />
                <p>ID: {buskerProfile?.busker_id}</p>
                <p>Name: {buskerProfile?.name}</p>
                <p>Art Form: {buskerProfile?.art_form}</p>
                <p>Act: {buskerProfile?.act}</p>
                <p>Bio: {buskerProfile?.bio}</p>
                <p>ImageURL: {buskerProfile?.image_url}</p>
                <p>Socials: {buskerProfile?.socials}</p>
              </div>
            </div>
          )}

          {activeTab === 2 && (
            <div className="content p-4">
              {/* Custom Profile tab content */}
              <div className="card rounded p-6 space-y-4">
                {/* custom bio */}
                <label className="block mb-2 font-bold">Intro</label>
                <textarea className="p-4 border-black bg-gray-300 rounded-lg" value={customBio} onChange={handleBioInputChange} placeholder="describe who you are"/>

                {/* custom image */}
                <label className="block mb-2 font-medium">Custom Profile Image:</label>
                <input type='file' className="p-4 border-black" onChange={handleProfileImgInputChange} />

                {/* Display the uploaded image */}
                {imagePreview && (
                  <div className="mt-4">
                    <img src={imagePreview} alt="Custom Profile" className="w-32 h-32 object-cover" />
                  </div>
                )}

                {/* save button */}
                <button className="primary-btn w-1/3 mt-4" onClick={handleUpdateProfile}>Save Profile</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

DashboardPage.displayName = 'DashboardPage';
export default withAuth(DashboardPage);
