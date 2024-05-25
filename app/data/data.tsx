export interface Musician {
    id: number;
    name: string;
    genre: string;
    language: string;
    location: string;
    bio: string;
    socialMedia: {
      facebook: string;
      twitter: string;
      instagram: string;
    };
  }
  
  export interface Event {
    eventId: number;
    name: string;
    location: string;
    realLifeLocation: string;
    performerId: number;
    musicGenres: string[];
    performanceStart: string;
    performanceEnd: string;
  }
  
  export const musicians: Musician[] = [
    { id: 1, name: 'John Doe', genre: 'Rock', language: 'English', location: 'LA', bio: 'Rock musician from LA', socialMedia: { facebook: 'https://facebook.com/johndoe', twitter: 'https://twitter.com/johndoe', instagram: 'https://instagram.com/johndoe' } },
    { id: 2, name: 'Jane Smith', genre: 'Jazz', language: 'English', location: 'NY', bio: 'Jazz musician from NY', socialMedia: { facebook: 'https://facebook.com/janesmith', twitter: 'https://twitter.com/janesmith', instagram: 'https://instagram.com/janesmith' } },
    { id: 3, name: 'Alice Tan', genre: 'Classical', language: 'Mandarin', location: 'Singapore', bio: 'Classical musician from Singapore', socialMedia: { facebook: 'https://facebook.com/alicetan', twitter: 'https://twitter.com/alicetan', instagram: 'https://instagram.com/alicetan' } },
    { id: 4, name: 'Bob Lim', genre: 'Pop', language: 'English', location: 'Singapore', bio: 'Pop musician from Singapore', socialMedia: { facebook: 'https://facebook.com/boblim', twitter: 'https://twitter.com/boblim', instagram: 'https://instagram.com/boblim' } },
    { id: 5, name: 'Charlie Wong', genre: 'Indie', language: 'Mandarin', location: 'Singapore', bio: 'Indie musician from Singapore', socialMedia: { facebook: 'https://facebook.com/charliewong', twitter: 'https://twitter.com/charliewong', instagram: 'https://instagram.com/charliewong' } },
  ];
  
  export const events: Event[] = [
    // John Doe's events
    {
      eventId: 1,
      name: 'Rock Night',
      location: 'Esplanade Concert Hall',
      realLifeLocation: '1 Esplanade Dr, Singapore 038981',
      date: '2024-05-14',
      performerId: 1,
      musicGenres: ['Rock', 'English'],
      performanceStart: '20:00',
      performanceEnd: '23:00'
    },
    {
      eventId: 2,
      name: 'Rock On!',
      location: 'Hard Rock Cafe',
      realLifeLocation: '50 Cuscaden Road, Singapore 249724',
      date: '2024-05-21',
      performerId: 1,
      musicGenres: ['Rock', 'English'],
      performanceStart: '21:00',
      performanceEnd: '00:00'
    },
    {
      eventId: 3,
      name: 'Rock Fest',
      location: 'The Star Theatre',
      realLifeLocation: '1 Vista Exchange Green, Singapore 138617',
      date: '2024-05-28',
      performerId: 1,
      musicGenres: ['Rock', 'English'],
      performanceStart: '19:00',
      performanceEnd: '22:00'
    },
    // Jane Smith's events
    {
      eventId: 4,
      name: 'Jazz Evening',
      location: 'Blu Jaz Cafe',
      realLifeLocation: '11 Bali Ln, Singapore 189848',
      date: '2024-05-14',
      performerId: 2,
      musicGenres: ['Jazz', 'English'],
      performanceStart: '18:00',
      performanceEnd: '21:00'
    },
    {
      eventId: 5,
      name: 'Smooth Jazz Night',
      location: 'Jazz @ Southbridge',
      realLifeLocation: '82 Boat Quay, Singapore 049870',
      date: '2024-05-18',
      performerId: 2,
      musicGenres: ['Jazz', 'English'],
      performanceStart: '20:00',
      performanceEnd: '23:00'
    },
    {
      eventId: 6,
      name: 'Jazz & Blues',
      location: 'The Jazz Loft',
      realLifeLocation: '10A Jiak Chuan Road, Singapore 089264',
      date: '2024-05-25',
      performerId: 2,
      musicGenres: ['Jazz', 'Blues', 'English'],
      performanceStart: '19:00',
      performanceEnd: '22:00'
    },
    // Alice Tan's events
    {
      eventId: 7,
      name: 'Classical Night',
      location: 'Victoria Concert Hall',
      realLifeLocation: '9 Empress Pl, Singapore 179556',
      date: '2024-05-14',
      performerId: 3,
      musicGenres: ['Classical'],
      performanceStart: '19:00',
      performanceEnd: '22:00'
    },
    {
      eventId: 8,
      name: 'Symphony Evening',
      location: 'Esplanade Concert Hall',
      realLifeLocation: '1 Esplanade Dr, Singapore 038981',
      date: '2024-05-19',
      performerId: 3,
      musicGenres: ['Classical'],
      performanceStart: '18:00',
      performanceEnd: '21:00'
    },
    {
      eventId: 9,
      name: 'Classical Vibes',
      location: 'Singapore Conference Hall',
      realLifeLocation: '7 Shenton Way, Singapore 068810',
      date: '2024-05-24',
      performerId: 3,
      musicGenres: ['Classical'],
      performanceStart: '19:00',
      performanceEnd: '22:00'
    },
    // Bob Lim's events
    {
      eventId: 10,
      name: 'Pop Fiesta',
      location: 'The Star Theatre',
      realLifeLocation: '1 Vista Exchange Green, Singapore 138617',
      date: '2024-05-14',
      performerId: 4,
      musicGenres: ['Pop', 'Top 40s'],
      performanceStart: '20:00',
      performanceEnd: '23:00'
    },
    {
      eventId: 11,
      name: 'Pop Extravaganza',
      location: 'Marina Bay Sands Theatre',
      realLifeLocation: '10 Bayfront Ave, Singapore 018956',
      date: '2024-05-22',
      performerId: 4,
      musicGenres: ['Pop', 'Top 40s'],
      performanceStart: '20:00',
      performanceEnd: '23:00'
    },
    {
      eventId: 12,
      name: 'Top 40 Hits Night',
      location: 'Zouk Singapore',
      realLifeLocation: '3C River Valley Road, The Cannery, Singapore 179022',
      date: '2024-05-29',
      performerId: 4,
      musicGenres: ['Pop', 'Top 40s'],
      performanceStart: '21:00',
      performanceEnd: '00:00'
    },
    // Charlie Wong's events
    {
      eventId: 13,
      name: 'Indie Vibes',
      location: 'Kult Kafe',
      realLifeLocation: '11 Upper Wilkie Rd, Singapore 228120',
      date: '2024-05-14',
      performerId: 5,
      musicGenres: ['Indie', 'Mandopop'],
      performanceStart: '17:00',
      performanceEnd: '20:00'
    },
    {
      eventId: 14,
      name: 'Indie Fest',
      location: 'The Projector',
      realLifeLocation: '6001 Beach Road, #05-00 Golden Mile Tower, Singapore 199589',
      date: '2024-05-20',
      performerId: 5,
      musicGenres: ['Indie', 'Mandopop'],
      performanceStart: '18:00',
      performanceEnd: '21:00'
    },
    {
      eventId: 15,
      name: 'Mandopop Night',
      location: 'The Esplanade Outdoor Theatre',
      realLifeLocation: '8 Raffles Ave, Singapore 039802',
      date: '2024-05-27',
      performerId: 5,
      musicGenres: ['Mandopop'],
      performanceStart: '19:00',
      performanceEnd: '22:00'
    },
  ];
  