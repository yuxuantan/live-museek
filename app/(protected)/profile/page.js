'use client';
import React, { useState, useEffect } from 'react';
import withAuth from '../../components/withAuth';
import { useAuth } from '../../context/AuthContext';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCamera } from '@fortawesome/free-solid-svg-icons';

const DashboardPage = () => {
  const { user, buskerProfile, updateBuskerProfile } = useAuth();

  const [updateSuccess, setUpdateSuccess] = useState(false);
  const [updateError, setUpdateError] = useState(false);
  const [acceptSwapRequest, setAcceptSwapRequest] = useState(undefined);
  const [selectedContactMethod, setSelectedContactMethod] = useState('');
  const [contactInput, setContactInput] = useState('');
  const [activeTab, setActiveTab] = useState(0); // To manage active tab
  // custombio
  const [bioInput, setBioInput] = useState('');
  // customimage
  const [customImage, setCustomImage] = useState('');

  const [imagePreview, setImagePreview] = useState(null); // Store the image preview URL

  // get current epoch time to ensure caching doesn't make the image stale
  const currentEpochTime = Math.floor(new Date().getTime() / 1000);

  useEffect(() => {
    console.log('busker profile reloaded')
    if (buskerProfile) {
      setAcceptSwapRequest(buskerProfile?.swap_configs?.accept_swap_requests ?? false);
      setSelectedContactMethod(buskerProfile?.swap_configs?.contact_method ?? '');
      setContactInput(buskerProfile?.swap_configs?.contact_info ?? '');
      setBioInput(buskerProfile?.custom_profile?.custom_bio ?? buskerProfile?.bio ?? '');
      setImagePreview(buskerProfile?.busker_id 
        ? `https://mlbwzkspmgxhudfnsfeb.supabase.co/storage/v1/object/public/busker_custom_images/${buskerProfile.busker_id}.jpg?${currentEpochTime}`
        : null
      );
      
    }
  }, [buskerProfile]);

  const handleResetProfile = async () => {
    const confirmReset = window.confirm("Are you sure you want to reset your profile to it's defaults? This action cannot be undone.");
    if (!confirmReset) return;

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
        custom_profile: {
          custom_bio: null,
        }
      });
      setUpdateSuccess(true);
    } catch (error) {
      setUpdateError(true);
    }
  };

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
    setBioInput(e.target.value);
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
        swap_configs: {
          accept_swap_requests: acceptSwapRequest,
          contact_method: selectedContactMethod,
          contact_info: contactInput
        },
        custom_profile: {
          custom_bio: bioInput,
        }
      }, customImage);


      setUpdateSuccess(true);
    } catch (error) {
      setUpdateError(true);
    }
  };

  return (
    <div className="flex items-center justify-center h-full m-4">
      <div className="items-center justify-center content-center gap-4 md:w-3/5 justify-self-center">
        <h1 className="text-3xl m-4">User Profile</h1>

        {/* Tabs component */}
        <div className="tabs tabs-lg">
          <a
            className={`tab tab-bordered ${activeTab === 0 ? 'underline underline-offset-8 tab-active text-blue-600' : 'text-gray-400'}`}
            onClick={() => setActiveTab(0)}
          >
            Busker Profile
          </a>
          <a
            className={`tab tab-bordered ${activeTab === 1 ? 'underline underline-offset-8 tab-active text-blue-600' : 'text-gray-400'}`}
            onClick={() => setActiveTab(1)}
          >
            Swap Settings
          </a>
        </div>

        {/* Tab content */}
        <div className="">

          {activeTab === 0 && (
            <div className="content p-4 card space-y-4 p-4 pb-12">
              {/* <p>* Premium members can edit busker profile</p> */}
              {/* Linked Busker Profile tab content */}
              <div className="relative">
                {/* Display the uploaded image */}
                {imagePreview && (
                  <div className="mt-4">
                    <label htmlFor="img_upload" className="btn rounded-full absolute bottom-0 left-36 bg-gray-300 hover:bg-blue-300"><FontAwesomeIcon icon={faCamera} /></label>
                    <img
                      src={`${imagePreview}`}
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = `https://mlbwzkspmgxhudfnsfeb.supabase.co/storage/v1/object/public/busker_images/${buskerProfile?.busker_id}.jpg?${currentEpochTime}`;
                      }}
                      className="h-48 aspect-square object-cover object-center rounded-full"
                    />
                  </div>
                )}
              </div>
              <input type='file' id="img_upload" accept="image/*" className="invisible" onChange={handleProfileImgInputChange} />
              <p className="text-bold">Busker ID: {buskerProfile?.busker_id}</p>
              <p>Name: {buskerProfile?.name}</p>
              <p>Art Form: {buskerProfile?.art_form}</p>
              <p>Act: {buskerProfile?.act}</p>
              {/* <p>Bio: {buskerProfile?.bio}</p> */}
              {/* custom bio */}
              <label className="block font-bold">Bio</label>
              <textarea
                className="p-4 border-black bg-gray-300 rounded-lg"
                value={bioInput ?? ''}
                onChange={handleBioInputChange}
                placeholder="describe who you are"
              />
              <p>Socials: {buskerProfile?.socials}</p>

              <button className="primary-btn md:w-1/3 mt-4" onClick={handleUpdateProfile}>Save Changes</button>
              {/* button to revert to NAC defaults */}
              <button className="primary-btn-inverse md:w-1/3 mt-4" onClick={handleResetProfile}>Reset to default</button>
            </div>
          )}
          {activeTab === 1 && (
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
                <div className="mt-4 grid md:grid-cols-2 gap-4">
                  <label className="block font-bold">Preferred contact method</label>
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

              <button className="primary-btn md:w-1/3 mt-4" onClick={handleUpdateProfile}>Save Configs</button>
              {updateSuccess && <div className="toast toast-middle toast-end"><div className="alert alert-success"><span>Configs saved</span></div></div>}
              {updateError && <p className="text-red-500">Update failed</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

DashboardPage.displayName = 'DashboardPage';
export default withAuth(DashboardPage);
