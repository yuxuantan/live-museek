import React from 'react';

const HomePage = () => {
  return  (
    <div>
      {/* Hero Section */}
      <section className="relative bg-cover bg-center h-screen md:p-24 p-8" style={{ backgroundImage: 'url("/hero-image.jpg")' }}>
        <div className="absolute inset-0 bg-black opacity-90 "></div>
        <div className="container mx-auto flex flex-col items-center justify-center h-full relative">
          <h1 className="md:text-5xl text-4xl font-bold text-center mb-4 ">Discover Live Music Like Never Before</h1>
          <p className="md:text-lg text-md mb-8 text-center">Your ultimate destination to find, explore, and experience live music events near you.</p>
          <a href="#events" className="primary-btn">Explore Events</a>
        </div>
      </section>

      {/* About Us Section */}
      <section className="py-20">
        <div className="container mx-auto text-center">
          <h2 className="md:text-4xl text-3xl font-bold mb-6">About Live Music Hub</h2>
          <p className="md:text-lg text-md mb-6">Live Music Hub connects music enthusiasts with live performances happening in their area. Whether you&apos;re a fan or a musician, our platform provides an easy way to discover and promote live music events.</p>
          <div className="flex md:flex-row flex-col justify-center md:space-x-4 md:space-y-0 space-y-8">
            <div className="card md:w-1/3 p-6 rounded-lg shadow">
              <h3 className="text-2xl font-semibold mb-4">For Fans</h3>
              <p>Find live music events by genre, location, and date. Never miss your favorite artists performing near you.</p>
            </div>
            <div className="card md:w-1/3 p-6 rounded-lg shadow">
              <h3 className="text-2xl font-semibold mb-4">For Musicians</h3>
              <p>Promote your gigs and connect with your audience. Make your performances more accessible and increase your fanbase.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Events Section */}
      <section id="events" className="py-20">
        <div className="container mx-auto text-center">
          <h2 className="text-4xl font-bold mb-6">Featured Events</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Example Event */}
            <div className="card p-6 rounded-lg shadow">
              <h3 className="text-2xl font-semibold mb-4">Rock Night at Esplanade</h3>
              <p className="text-gray-700 mb-2">Date: 20th May 2024</p>
              <p className="text-gray-700 mb-2">Location: Esplanade Concert Hall, Singapore</p>
              <p className="text-gray-700 mb-2">Genres: Rock, English</p>
              <a href="#" className="text-blue-500 hover:underline">Learn More</a>
            </div>
            {/* Add more events here */}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-20">
        <div className="container mx-auto text-center">
          <h2 className="text-4xl font-bold mb-6">How It Works</h2>
          <div className="flex flex-wrap justify-center">
            <div className="w-full md:w-1/3 p-4">
              <div className="card p-6 rounded-lg shadow">
                <h3 className="text-2xl font-semibold mb-4">Discover Events</h3>
                <p className="text-gray-700">Browse through a curated list of live music events happening around you. Filter by genre, location, and date to find your perfect music experience.</p>
              </div>
            </div>
            <div className="w-full md:w-1/3 p-4">
              <div className="card p-6 rounded-lg shadow">
                <h3 className="text-2xl font-semibold mb-4">Promote Your Gigs</h3>
                <p className="text-gray-700">Are you a musician? List your gigs on Live Music Hub and reach a broader audience. Let your fans know where and when you are performing next.</p>
              </div>
            </div>
            <div className="w-full md:w-1/3 p-4">
              <div className="card p-6 rounded-lg shadow">
                <h3 className="text-2xl font-semibold mb-4">Connect with Artists</h3>
                <p className="text-gray-700">Follow your favorite artists and get notified about their upcoming performances. Engage with the community and never miss a beat.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Call to Action Section */}
      <section className="py-20">
        <div className="container mx-auto text-center">
          <h2 className="text-4xl font-bold mb-6">Join Live Music Hub Today</h2>
          <p className="text-lg mb-8">Sign up now to start discovering amazing live music events and promoting your performances.</p>
          <a href="#" className="primary-btn">Get Started</a>
        </div>
      </section>

      {/* Footer Section */}
      <footer className="py-6">
        <div className="container mx-auto text-center">
          <p className="mb-4">&copy; 2024 Live Music Hub. All rights reserved.</p>
          <div className="flex justify-center space-x-4">
            <a href="#" className="hover:text-gray-400">Privacy Policy</a>
            <a href="#" className="hover:text-gray-400">Terms of Service</a>
            <a href="#" className="hover:text-gray-400">Contact Us</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
export default HomePage;
